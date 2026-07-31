import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import TelevicApi, { TelevicApiError, type SeatDiscussionState } from './api.js'
import { GetConfigFields, type TelevicConferoConfig } from './config.js'
import { UpdateActions } from './actions.js'
import { UpdateFeedbacks, FEEDBACK_IDS } from './feedbacks.js'
import { UpdateVariableDefinitions, UpdateVariableValues } from './variables.js'
import { UpdatePresets } from './presets.js'
import { audioConfigSignature, devicesOnline, emptyState, stateSignature, type RoomState } from './state.js'
import { UpgradeScripts } from './upgrades.js'

/** Slow-moving values are only refreshed every Nth tick. */
const SLOW_POLL_EVERY = 5
/** How long a long-poll request is allowed to block on the unit. */
const EVENT_POLL_TIMEOUT = 30000
/** Safety-net poll interval when real-time events are carrying the load. */
const EVENT_MODE_MIN_POLL = 5000
/** Sockets opened at once when falling back to per-seat reads. */
const SEAT_BATCH = 8
/** As reported by /api/notification/modules on a D-Cerno AE. */
const EVENT_MODULES = ['Discussion', 'Recording', 'System', 'Audio', 'Device', 'Room']

export class TelevicConferoInstance extends InstanceBase<TelevicConferoConfig> {
	config!: TelevicConferoConfig
	private api: TelevicApi | undefined
	private state: RoomState = emptyState()
	private signature = ''
	private pollTimer: NodeJS.Timeout | undefined
	private tick = 0
	private running = false
	private polling = false
	private eventsRunning = false
	private eventsEnabled = false
	private nextEventId = 0
	/** Cleared if the firmware has no room-wide seat endpoint, forcing per-seat reads. */
	private bulkSeats = true
	/** Seat numbers last seen on the unit, so variables and presets follow the real room. */
	private knownSeats: number[] = []
	/** Identifies the audio configuration list, so dropdowns are rebuilt when it changes. */
	private audioConfigSignature = ''

	async init(config: TelevicConferoConfig): Promise<void> {
		this.config = config
		await this.start()
	}

	async configUpdated(config: TelevicConferoConfig): Promise<void> {
		this.config = config
		this.stopLoops()
		await this.start()
	}

	async destroy(): Promise<void> {
		this.stopLoops()
		this.api = undefined
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	// --- lifecycle ----------------------------------------------------------

	private async start(): Promise<void> {
		this.state = emptyState()
		this.signature = ''

		if (!this.config.host || !this.config.token) {
			this.updateStatus(InstanceStatus.BadConfig, 'IP address and API token are required')
			return
		}

		this.api = new TelevicApi({
			host: this.config.host,
			port: this.config.port,
			token: this.config.token,
			useHttps: this.config.useHttps,
			allowSelfSigned: this.config.allowSelfSigned,
			timeout: this.config.timeout,
		})

		this.updateStatus(InstanceStatus.Connecting)

		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdateVariableDefinitions(this)
		UpdatePresets(this)

		// Probe for real instead of reporting Ok on faith.
		try {
			this.state.seats = indexSeats(await this.fetchSeats(this.api))
			this.updateStatus(InstanceStatus.Ok)
		} catch (e) {
			this.reportError(e, 'Initial connection failed')
			// Keep the loop running anyway: the unit may just be booting.
		}

		this.running = true
		this.eventsEnabled = this.config.useEvents
		this.scheduleNextPoll(0)
		if (this.eventsEnabled) void this.runEventLoop()
	}

	private stopLoops(): void {
		this.running = false
		this.eventsEnabled = false
		if (this.pollTimer) {
			clearTimeout(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	private scheduleNextPoll(delay: number): void {
		if (!this.running) return
		this.pollTimer = setTimeout(() => {
			void this.poll()
		}, delay)
	}

	private pollDelay(): number {
		return this.eventsEnabled ? Math.max(this.config.pollInterval, EVENT_MODE_MIN_POLL) : this.config.pollInterval
	}

	// --- polling ------------------------------------------------------------

	/**
	 * One request for the whole room when the firmware supports it, falling back to
	 * batched per-seat reads on older units.
	 */
	private async fetchSeats(api: TelevicApi): Promise<SeatDiscussionState[]> {
		if (this.bulkSeats) {
			try {
				return await api.getSeats()
			} catch (e) {
				if (!(e instanceof TelevicApiError) || e.kind !== 'notfound') throw e
				this.log('warn', 'This firmware has no room-wide seat endpoint; falling back to one request per seat.')
				this.bulkSeats = false
			}
		}

		// Targets the seats discovered on the unit, not 1..N — a room can be wired 20/25/30.
		const seats: SeatDiscussionState[] = []
		const ids = this.seats()
		for (let i = 0; i < ids.length; i += SEAT_BATCH) {
			const batch = ids.slice(i, i + SEAT_BATCH)
			const results = await Promise.allSettled(batch.map(async (seat) => api.getSeat(seat)))
			results.forEach((result, index) => {
				if (result.status === 'fulfilled' && result.value) {
					// Older firmwares omit seatNumber, so trust the number we asked for.
					seats.push({ ...result.value, seatNumber: batch[index] })
				}
			})
		}
		return seats
	}

	/**
	 * Values that rarely move: presence, recording, volumes, discussion settings, audio
	 * configurations, device inventory and reordering state. Each one is allowed to fail
	 * on its own — a firmware missing one endpoint must not blank the rest.
	 */
	private async pollSlowValues(api: TelevicApi): Promise<void> {
		const [roomSeats, recording, lsGain, csGain, settings, configs, devices, reordering] = await Promise.allSettled([
			api.getRoomSeats(),
			api.getRecordingState(),
			api.getLoudspeakerVolume(),
			api.getChannelSelectorVolume(),
			api.getDiscussionSettings(),
			api.getAudioConfigurations(),
			api.getDevices(),
			api.getReorderingState(),
		])

		if (roomSeats.status === 'fulfilled') {
			this.state.online = new Set(roomSeats.value.filter((s) => s.state === 'online').map((s) => s.seatNumber))
			this.state.roomSeatCount = roomSeats.value.length
		}
		if (recording.status === 'fulfilled') this.state.recording = recording.value
		if (lsGain.status === 'fulfilled') this.state.loudspeakerGain = lsGain.value
		if (csGain.status === 'fulfilled') this.state.channelSelectorGain = csGain.value
		if (settings.status === 'fulfilled') this.state.settings = settings.value
		if (devices.status === 'fulfilled') this.state.devices = devices.value
		if (reordering.status === 'fulfilled') this.state.reordering = reordering.value
		if (configs.status === 'fulfilled') {
			this.state.audioConfigs = configs.value
			// The configuration list feeds dropdowns, so definitions follow it.
			const signature = audioConfigSignature(configs.value)
			if (signature !== this.audioConfigSignature) {
				this.audioConfigSignature = signature
				UpdateActions(this)
				UpdateFeedbacks(this)
				UpdatePresets(this)
			}
		}
	}

	private async poll(): Promise<void> {
		if (!this.running || !this.api || this.polling) return
		const api = this.api
		this.polling = true

		try {
			const slow = this.tick % SLOW_POLL_EVERY === 0
			const [seats, speakers, requests] = await Promise.allSettled([
				this.fetchSeats(api),
				api.getSpeakers(),
				api.getRequests(),
			])
			if (slow) await this.pollSlowValues(api)

			if (seats.status === 'fulfilled') {
				this.state.seats = indexSeats(seats.value)
				this.updateStatus(InstanceStatus.Ok)
			} else {
				this.reportError(seats.reason, 'Poll failed')
			}
			// The ordered lists are the source of truth for "who spoke first"; if the
			// firmware does not expose them, fall back to the (unordered) seat states.
			this.state.speakers =
				speakers.status === 'fulfilled' ? speakers.value : seatsMatching(this.state.seats, (s) => s.microphoneOn)
			this.state.requests =
				requests.status === 'fulfilled' ? requests.value : seatsMatching(this.state.seats, (s) => s.requestingToSpeak)
			this.publish()
			this.tick++
		} catch (e) {
			this.reportError(e, 'Poll failed')
		} finally {
			this.polling = false
			this.scheduleNextPoll(this.pollDelay())
		}
	}

	/** Push variables and redraw feedbacks, but only when the room actually changed. */
	private publish(): void {
		const signature = stateSignature(this.state)
		if (signature === this.signature) return
		this.signature = signature
		this.refreshSeatList()
		UpdateVariableValues(this)
		this.checkFeedbacks(...FEEDBACK_IDS)
	}

	/**
	 * Seats are rarely numbered 1..N — a room can be wired 20, 25, 30. Definitions follow
	 * whatever the unit reports, and are rebuilt only when that set changes.
	 */
	private refreshSeatList(): void {
		const seen = new Set<number>([...this.state.seats.keys(), ...this.state.online])
		const seats = [...seen].sort((a, b) => a - b)
		if (seats.length === 0) return
		if (seats.length === this.knownSeats.length && seats.every((n, i) => n === this.knownSeats[i])) return

		this.knownSeats = seats
		const online = this.onlineSeats()
		this.log('info', `${seats.length} seats configured on the unit, ${online.length} online: ${online.join(', ')}`)
		UpdateVariableDefinitions(this)
		UpdatePresets(this)
	}

	/** The seats to publish: those found on the unit, or 1..seatCount before the first answer. */
	public seats(): number[] {
		if (this.knownSeats.length > 0) return this.knownSeats
		return Array.from({ length: this.seatCount() }, (_, i) => i + 1)
	}

	/**
	 * Seats with a unit actually plugged in. A room can be configured for 44 seats and
	 * have 3 connected, and only those 3 deserve a button.
	 */
	/** Conference units reported as connected, regardless of how many seats are configured. */
	public unitsOnline(): number {
		return devicesOnline(this.state)
	}

	public onlineSeats(): number[] {
		if (this.state.online.size === 0) return this.seats()
		return [...this.state.online].sort((a, b) => a - b)
	}

	/** Refresh now rather than waiting for the next tick — used after an action or an event. */
	public refreshSoon(): void {
		if (!this.running) return
		if (this.pollTimer) clearTimeout(this.pollTimer)
		this.scheduleNextPoll(0)
	}

	// --- real-time events ---------------------------------------------------

	private async runEventLoop(): Promise<void> {
		if (this.eventsRunning) return
		this.eventsRunning = true
		try {
			while (this.running && this.eventsEnabled && this.api) {
				try {
					const event = await this.api.getNextEvent(this.nextEventId, EVENT_MODULES, EVENT_POLL_TIMEOUT)
					if (event) {
						this.nextEventId = event.id + 1
						if (this.config.verbose) {
							this.log('debug', `event ${event.module}/${event.name} #${event.id}`)
						}
						this.refreshSoon()
					}
				} catch (e) {
					if (e instanceof TelevicApiError && e.kind === 'timeout') {
						continue // normal for a long poll with nothing to report
					}
					if (e instanceof TelevicApiError && (e.kind === 'notfound' || e.kind === 'http')) {
						this.log('warn', `Real-time events unavailable (${e.message}). Falling back to periodic polling.`)
						this.eventsEnabled = false
						return
					}
					// Transport error: back off and let the poll loop report the status.
					await sleep(this.config.pollInterval)
				}
			}
		} finally {
			this.eventsRunning = false
		}
	}

	// --- helpers used by actions / feedbacks / variables ---------------------

	public getState(): RoomState {
		return this.state
	}

	public getSeatState(seat: number): SeatDiscussionState | undefined {
		return this.state.seats.get(seat)
	}

	public seatCount(): number {
		return this.config.seatCount || 16
	}

	/**
	 * Runs an API call, maps failures onto the instance status and refreshes the cache
	 * so the button reflects the new state without waiting a full tick.
	 *
	 * `optional` marks a call whose endpoint only exists on part of the range: a 404 is
	 * then a log line rather than a connection error, so a D-Cerno AE does not go red
	 * because someone pressed a meeting button.
	 */
	public async run(what: string, fn: (api: TelevicApi) => Promise<void>, optional = false): Promise<void> {
		if (!this.api) {
			this.log('warn', `${what} skipped: module is not configured`)
			return
		}
		try {
			await fn(this.api)
			if (this.config.verbose) this.log('debug', what)
			this.refreshSoon()
		} catch (e) {
			if (optional && e instanceof TelevicApiError && e.kind === 'notfound') {
				this.log('warn', `${what}: not available on this platform`)
				return
			}
			this.reportError(e, what)
		}
	}

	private reportError(e: unknown, context: string): void {
		if (e instanceof TelevicApiError) {
			switch (e.kind) {
				case 'auth':
					this.updateStatus(InstanceStatus.BadConfig, 'Invalid API token')
					break
				case 'timeout':
				case 'refused':
				case 'unreachable':
					this.updateStatus(InstanceStatus.ConnectionFailure, e.message)
					break
				case 'notfound':
					this.updateStatus(InstanceStatus.UnknownWarning, e.message)
					break
				default:
					this.updateStatus(InstanceStatus.UnknownError, e.message)
			}
			this.log('error', `${context}: ${e.message}`)
			return
		}
		const message = e instanceof Error ? e.message : String(e)
		this.updateStatus(InstanceStatus.UnknownError, message)
		this.log('error', `${context}: ${message}`)
	}
}

function indexSeats(seats: SeatDiscussionState[]): Map<number, SeatDiscussionState> {
	const map = new Map<number, SeatDiscussionState>()
	for (const seat of seats) map.set(seat.seatNumber, seat)
	return map
}

function seatsMatching(
	seats: Map<number, SeatDiscussionState>,
	predicate: (seat: SeatDiscussionState) => boolean,
): number[] {
	return [...seats.values()]
		.filter(predicate)
		.map((s) => s.seatNumber)
		.sort((a, b) => a - b)
}

async function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms))
}

runEntrypoint(TelevicConferoInstance, UpgradeScripts)
