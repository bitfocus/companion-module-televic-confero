import https from 'https'
import fetch, { type RequestInit, type Response } from 'node-fetch'

/** Why the call failed, so the caller can map it to a Companion status without parsing strings. */
export type TelevicErrorKind = 'auth' | 'timeout' | 'refused' | 'unreachable' | 'notfound' | 'http'

export class TelevicApiError extends Error {
	readonly kind: TelevicErrorKind
	readonly status: number | undefined

	constructor(kind: TelevicErrorKind, message: string, status?: number) {
		super(message)
		this.name = 'TelevicApiError'
		this.kind = kind
		this.status = status
	}
}

export type SeatRole = 'delegate' | 'vip' | 'chairperson'
export type MicrophoneMode = 'directSpeak' | 'request' | 'group' | 'operator' | 'handsFree'
export type RecordingState = 'idle' | 'recording' | 'paused'

export interface SeatDiscussionState {
	seatNumber: number
	microphoneOn: boolean
	requestingToSpeak: boolean
	role: SeatRole
}

export interface RoomSeat {
	seatNumber: number
	state: 'offline' | 'online'
	capabilities?: string[]
	units?: unknown[]
}

export interface DiscussionSettings {
	maximumNumberOfSpeakers: number
	microphoneMode: MicrophoneMode
	options?: Record<string, unknown>
}

export type LedColor = 'off' | 'red' | 'green'
export type ActivationType = 'toggle' | 'push' | 'vox'

/**
 * Each microphone mode has its own required `options` shape, and the unit answers
 * 400 if the body still carries the previous mode's fields. Colours already set on
 * the unit are carried over; everything else falls back to a sane default.
 */
export function optionsForMode(
	mode: MicrophoneMode,
	previous: Record<string, unknown> | undefined,
	activation: ActivationType = 'toggle',
): Record<string, unknown> {
	const keep = (key: string, fallback: LedColor): LedColor => {
		const value = previous?.[key]
		return value === 'off' || value === 'red' || value === 'green' ? value : fallback
	}
	const on = keep('ledColorOn', 'red')
	const off = keep('ledColorOff', 'off')
	// This one has no 'off' value in request mode, so it gets its own guard.
	const request = keep('ledColorRequest', 'green') === 'off' ? 'green' : keep('ledColorRequest', 'green')

	switch (mode) {
		case 'directSpeak':
			return {
				microphoneActivationType: activation === 'vox' ? 'toggle' : activation,
				speakerOverrideAllowed: false,
				switchOffAllowed: true,
				ledColorOn: on,
				ledColorOff: off,
			}
		case 'request':
			return {
				switchOffAllowed: true,
				cancelRequestAllowed: true,
				ledColorOn: on,
				ledColorRequest: request,
				ledColorOff: off,
				nextInLineIndication: true,
			}
		case 'group':
			return {
				microphoneActivationType: activation,
				ledColorOn: on,
				ledColorRequest: request,
				ledColorOff: off,
			}
		case 'handsFree':
			return { pushToMute: true, ledColorOn: on, ledColorOff: off }
		case 'operator':
		default:
			return { ledColorOn: on, ledColorOff: off }
	}
}

/** Gain is expressed in units of 0.1 dB by the API (gain: -140 means -14.0 dB). */
export interface Volume {
	gain: number
}

export interface SensitivityOffset {
	input_sensitivity_offset: number
}

export interface AudioConfiguration {
	id: string
	name: string
	isActive: boolean
}

export interface Device {
	serial: string
	state: 'online' | 'offline' | string
	deviceType: string
}

export type ReorderingState = 'idle' | 'reordering'

export interface TelevicNotification {
	discontinuity: boolean
	id: number
	module: string
	name: string
	/** Shape depends on the event: SpeakersChanged carries an array of seat numbers. */
	data?: unknown
}

export interface TelevicApiOptions {
	host: string
	port: number
	token: string
	useHttps: boolean
	allowSelfSigned: boolean
	/** Timeout applied to every regular call, in ms. */
	timeout: number
}

export default class TelevicApi {
	private readonly options: TelevicApiOptions
	private readonly agent: https.Agent | undefined

	constructor(options: TelevicApiOptions) {
		this.options = options
		this.agent =
			options.useHttps && options.allowSelfSigned ? new https.Agent({ rejectUnauthorized: false }) : undefined
	}

	private baseUrl(): string {
		const scheme = this.options.useHttps ? 'https' : 'http'
		return `${scheme}://${this.options.host}:${this.options.port}`
	}

	/**
	 * Every call goes through here so that timeouts, auth errors and transport errors
	 * are reported the same way. Returns undefined on 204 No Content.
	 */
	private async request<T>(
		method: 'get' | 'put' | 'post' | 'delete',
		path: string,
		body?: unknown,
		timeoutOverride?: number,
	): Promise<T | undefined> {
		const controller = new AbortController()
		const timeout = timeoutOverride ?? this.options.timeout
		const timer = setTimeout(() => controller.abort(), timeout)

		const init: RequestInit = {
			method,
			headers: {
				Accept: 'application/json',
				Authorization: `Bearer ${this.options.token}`,
				...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
			},
			agent: this.agent,
			signal: controller.signal as RequestInit['signal'],
		}
		if (body !== undefined) init.body = JSON.stringify(body)

		let response: Response
		try {
			response = await fetch(`${this.baseUrl()}${path}`, init)
		} catch (e: unknown) {
			const err = e as { name?: string; code?: string; message?: string }
			if (err.name === 'AbortError') {
				throw new TelevicApiError('timeout', `No answer from ${this.options.host} within ${timeout} ms`)
			}
			if (err.code === 'ECONNREFUSED') {
				throw new TelevicApiError(
					'refused',
					`Connection refused by ${this.options.host}:${this.options.port}. Is the REST API enabled on that port?`,
				)
			}
			throw new TelevicApiError('unreachable', err.message ?? 'Network error')
		} finally {
			clearTimeout(timer)
		}

		if (response.status === 401 || response.status === 403) {
			throw new TelevicApiError('auth', 'Rejected by the unit: check the API bearer token', response.status)
		}
		if (response.status === 404) {
			throw new TelevicApiError('notfound', `Endpoint ${path} is not available on this firmware`, 404)
		}
		if (!response.ok) {
			throw new TelevicApiError('http', `HTTP ${response.status} ${response.statusText} on ${path}`, response.status)
		}
		if (response.status === 204) return undefined

		const text = await response.text()
		if (text.length === 0) return undefined
		return JSON.parse(text) as T
	}

	// --- Discussion ---------------------------------------------------------

	/** One call for the whole room — this is what keeps the poll loop cheap. */
	public async getSeats(): Promise<SeatDiscussionState[]> {
		return (await this.request<SeatDiscussionState[]>('get', '/api/discussion/seats')) ?? []
	}

	public async getSeat(seat: number): Promise<SeatDiscussionState | undefined> {
		return await this.request<SeatDiscussionState>('get', `/api/discussion/seats/${seat}`)
	}

	/** Only the given fields are sent, so a mic action never clears a pending request to speak. */
	public async setSeat(seat: number, changes: { microphoneOn?: boolean; requestingToSpeak?: boolean }): Promise<void> {
		await this.request('put', `/api/discussion/seats/${seat}`, changes)
	}

	public async getSpeakers(): Promise<number[]> {
		return (await this.request<number[]>('get', '/api/discussion/speakers')) ?? []
	}

	public async getRequests(): Promise<number[]> {
		return (await this.request<number[]>('get', '/api/discussion/requests')) ?? []
	}

	public async clearSpeakers(): Promise<void> {
		await this.request('delete', '/api/discussion/speakers')
	}

	public async clearDelegateSpeakers(): Promise<void> {
		await this.request('delete', '/api/discussion/speakers/delegates')
	}

	public async clearRequests(): Promise<void> {
		await this.request('delete', '/api/discussion/requests')
	}

	public async getDiscussionSettings(): Promise<DiscussionSettings | undefined> {
		return await this.request<DiscussionSettings>('get', '/api/discussion/settings')
	}

	public async setDiscussionSettings(settings: DiscussionSettings): Promise<void> {
		await this.request('put', '/api/discussion/settings', settings)
	}

	// --- Room ---------------------------------------------------------------

	public async getRoomSeats(): Promise<RoomSeat[]> {
		return (await this.request<RoomSeat[]>('get', '/api/room/seats/discussion')) ?? []
	}

	// --- Audio --------------------------------------------------------------

	public async getLoudspeakerVolume(): Promise<number | undefined> {
		return (await this.request<Volume>('get', '/api/audio/loudspeakervolume'))?.gain
	}

	public async setLoudspeakerVolume(gain: number): Promise<void> {
		await this.request('put', '/api/audio/loudspeakervolume', { gain: Math.round(gain) })
	}

	public async getChannelSelectorVolume(): Promise<number | undefined> {
		return (await this.request<Volume>('get', '/api/audio/defaultchannelselectorvolume'))?.gain
	}

	public async setChannelSelectorVolume(gain: number): Promise<void> {
		await this.request('put', '/api/audio/defaultchannelselectorvolume', { gain: Math.round(gain) })
	}

	/** Pushes the default volume onto every channel selector in the room. */
	public async pushChannelSelectorVolume(): Promise<void> {
		await this.request('put', '/api/audio/defaultchannelselectorvolume/push')
	}

	public async getAudioConfigurations(): Promise<AudioConfiguration[]> {
		return (await this.request<AudioConfiguration[]>('get', '/api/audio/configurations')) ?? []
	}

	public async activateAudioConfiguration(id: string): Promise<void> {
		await this.request('post', `/api/audio/configurations/${encodeURIComponent(id)}/activate`)
	}

	public async getInputSensitivityOffset(seat: number): Promise<number | undefined> {
		return (await this.request<SensitivityOffset>('get', `/api/audio/seats/${seat}/inputsensitivityoffset`))
			?.input_sensitivity_offset
	}

	public async setInputSensitivityOffset(seat: number, offset: number): Promise<void> {
		await this.request('put', `/api/audio/seats/${seat}/inputsensitivityoffset`, {
			input_sensitivity_offset: Math.round(offset),
		})
	}

	// --- Meeting / recording / system ----------------------------------------

	/** Plixus and Confero only: a D-Cerno AE answers 404 on this path. */
	public async startLocalMeeting(): Promise<void> {
		await this.request('post', '/api/meeting', { kind: 'NewMeetingFromLocalTemplate' })
	}

	public async stopMeeting(): Promise<void> {
		await this.request('delete', '/api/meeting')
	}

	public async getRecordingState(): Promise<RecordingState | undefined> {
		return (await this.request<{ state: RecordingState }>('get', '/api/recording/state'))?.state
	}

	public async setRecordingState(state: RecordingState): Promise<void> {
		await this.request('put', '/api/recording/state', { state })
	}

	public async reboot(): Promise<void> {
		await this.request('post', '/api/system/reboot', {})
	}

	public async getDevices(): Promise<Device[]> {
		return (await this.request<Device[]>('get', '/api/device/devices')) ?? []
	}

	public async getReorderingState(): Promise<ReorderingState | undefined> {
		return (await this.request<{ state: ReorderingState }>('get', '/api/system/reordering-state'))?.state
	}

	public async setReorderingState(state: ReorderingState): Promise<void> {
		await this.request('put', '/api/system/reordering-state', { state })
	}

	// --- Notifications ------------------------------------------------------

	/**
	 * Long poll: blocks on the unit until the next event is available, so it needs a
	 * timeout of its own. Returns undefined when the unit answers 204 (nothing new).
	 */
	public async getNextEvent(
		minimumId: number,
		filters: string[],
		timeout: number,
	): Promise<TelevicNotification | undefined> {
		const query = new URLSearchParams({ 'minimum-id': String(minimumId) })
		if (filters.length > 0) query.set('include-filter', filters.join(','))
		return await this.request<TelevicNotification>(
			'get',
			`/api/notification/events?${query.toString()}`,
			undefined,
			timeout,
		)
	}

	public async getNotificationModules(): Promise<string[]> {
		return (await this.request<string[]>('get', '/api/notification/modules')) ?? []
	}
}
