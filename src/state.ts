import type {
	AudioConfiguration,
	Device,
	DiscussionSettings,
	RecordingState,
	ReorderingState,
	SeatDiscussionState,
} from './api.js'

/**
 * Everything the poll loop knows about the room. Feedbacks read this synchronously,
 * so a redraw never costs an HTTP request.
 */
export interface RoomState {
	seats: Map<number, SeatDiscussionState>
	online: Set<number>
	/** Seats currently speaking, oldest first. */
	speakers: number[]
	/** Seats requesting to speak, oldest first. */
	requests: number[]
	recording: RecordingState | undefined
	/** Raw API gain, in units of 0.1 dB. */
	loudspeakerGain: number | undefined
	channelSelectorGain: number | undefined
	settings: DiscussionSettings | undefined
	roomSeatCount: number
	audioConfigs: AudioConfiguration[]
	devices: Device[]
	reordering: ReorderingState | undefined
}

export function emptyState(): RoomState {
	return {
		seats: new Map(),
		online: new Set(),
		speakers: [],
		requests: [],
		recording: undefined,
		loudspeakerGain: undefined,
		channelSelectorGain: undefined,
		settings: undefined,
		roomSeatCount: 0,
		audioConfigs: [],
		devices: [],
		reordering: undefined,
	}
}

/** Cheap change detector: if this string is unchanged, nothing needs redrawing. */
export function stateSignature(state: RoomState): string {
	const seats = [...state.seats.values()]
		.sort((a, b) => a.seatNumber - b.seatNumber)
		.map((s) => `${s.seatNumber}:${s.microphoneOn ? 1 : 0}${s.requestingToSpeak ? 1 : 0}${s.role}`)
		.join(',')
	return [
		seats,
		[...state.online].sort((a, b) => a - b).join('.'),
		state.speakers.join('.'),
		state.requests.join('.'),
		state.recording,
		state.loudspeakerGain,
		state.channelSelectorGain,
		state.settings?.microphoneMode,
		state.settings?.maximumNumberOfSpeakers,
		state.audioConfigs.map((c) => `${c.id}${c.isActive ? '*' : ''}`).join('.'),
		devicesOnline(state),
		state.devices.length,
		state.reordering,
	].join('|')
}

/** Identifies the set of audio configurations, so actions are only rebuilt when it changes. */
export function audioConfigSignature(configs: AudioConfiguration[]): string {
	return configs.map((c) => `${c.id}:${c.name}`).join('|')
}

/**
 * The device list includes the central unit itself, which would inflate every count
 * by one. Only the conference desks are interesting for monitoring.
 */
export function isDesk(device: Device): boolean {
	return !/centralunit/i.test(device.deviceType)
}

export function desks(state: RoomState): Device[] {
	return state.devices.filter(isDesk)
}

export function devicesOnline(state: RoomState): number {
	return desks(state).filter((d) => d.state === 'online').length
}

/** The API works in 0.1 dB steps; buttons and variables work in dB. */
export function gainToDb(gain: number | undefined): number | undefined {
	return gain === undefined ? undefined : gain / 10
}

export function dbToGain(db: number): number {
	return Math.round(db * 10)
}
