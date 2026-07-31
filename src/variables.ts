import type { CompanionVariableDefinition, CompanionVariableValues } from '@companion-module/base'
import type { TelevicConferoInstance } from './main.js'
import { desks, devicesOnline, gainToDb } from './state.js'

/** How many "who is speaking / who is next" slots are published as variables. */
const RANKED_SLOTS = 8

export function UpdateVariableDefinitions(self: TelevicConferoInstance): void {
	const definitions: CompanionVariableDefinition[] = [
		{ variableId: 'active_mic_count', name: 'Number of open microphones' },
		{ variableId: 'active_seats', name: 'Seats speaking, oldest first' },
		{ variableId: 'first_speaker', name: 'Seat speaking the longest' },
		{ variableId: 'last_speaker', name: 'Seat that started speaking last' },
		{ variableId: 'requesting_count', name: 'Number of seats requesting to speak' },
		{ variableId: 'requesting_seats', name: 'Seats requesting to speak, oldest first' },
		{ variableId: 'next_request', name: 'Next seat in the request list' },
		{ variableId: 'chairperson_seats', name: 'Seats holding the chairperson role' },
		{ variableId: 'recording_state', name: 'Recording state' },
		{ variableId: 'loudspeaker_volume', name: 'Loudspeaker volume (dB)' },
		{ variableId: 'channelselector_volume', name: 'Default channel selector volume (dB)' },
		{ variableId: 'mic_mode', name: 'Microphone mode' },
		{ variableId: 'max_speakers', name: 'Maximum number of open microphones' },
		{ variableId: 'room_seat_count', name: 'Seats known to the unit' },
		{ variableId: 'seats_online', name: 'Seats with a unit connected' },
		{ variableId: 'units_online', name: 'Conference desks online (central unit excluded)' },
		{ variableId: 'units_total', name: 'Conference desks known to the system' },
		{ variableId: 'units_offline', name: 'Conference desks offline' },
		{ variableId: 'audio_config', name: 'Active audio configuration' },
		{ variableId: 'audio_config_count', name: 'Number of audio configurations' },
		{ variableId: 'reordering_state', name: 'Seat reordering state' },
	]

	// Ranked slots, so a button can show "who is speaking now" without expressions.
	for (let rank = 1; rank <= RANKED_SLOTS; rank++) {
		definitions.push(
			{ variableId: `speaker_${rank}`, name: `Seat speaking, position ${rank}` },
			{ variableId: `request_${rank}`, name: `Seat requesting, position ${rank}` },
		)
	}

	for (const seat of self.seats()) {
		definitions.push(
			{ variableId: `seat_${seat}_mic`, name: `Seat ${seat} microphone` },
			{ variableId: `seat_${seat}_request`, name: `Seat ${seat} request to speak` },
			{ variableId: `seat_${seat}_role`, name: `Seat ${seat} role` },
			{ variableId: `seat_${seat}_online`, name: `Seat ${seat} presence` },
		)
	}

	self.setVariableDefinitions(definitions)
}

export function UpdateVariableValues(self: TelevicConferoInstance): void {
	const state = self.getState()
	const chairpersons = [...state.seats.values()]
		.filter((s) => s.role === 'chairperson')
		.map((s) => s.seatNumber)
		.sort((a, b) => a - b)

	const values: CompanionVariableValues = {
		active_mic_count: state.speakers.length,
		active_seats: state.speakers.join(', '),
		first_speaker: state.speakers[0] ?? '',
		last_speaker: state.speakers[state.speakers.length - 1] ?? '',
		requesting_count: state.requests.length,
		requesting_seats: state.requests.join(', '),
		next_request: state.requests[0] ?? '',
		chairperson_seats: chairpersons.join(', '),
		recording_state: state.recording ?? '',
		loudspeaker_volume: gainToDb(state.loudspeakerGain) ?? '',
		channelselector_volume: gainToDb(state.channelSelectorGain) ?? '',
		mic_mode: state.settings?.microphoneMode ?? '',
		max_speakers: state.settings?.maximumNumberOfSpeakers ?? '',
		room_seat_count: state.roomSeatCount,
		seats_online: state.online.size,
		units_online: devicesOnline(state),
		units_total: desks(state).length,
		units_offline: desks(state).length - devicesOnline(state),
		audio_config: state.audioConfigs.find((c) => c.isActive)?.name ?? '',
		audio_config_count: state.audioConfigs.length,
		reordering_state: state.reordering ?? '',
	}

	for (let rank = 1; rank <= RANKED_SLOTS; rank++) {
		values[`speaker_${rank}`] = state.speakers[rank - 1] ?? ''
		values[`request_${rank}`] = state.requests[rank - 1] ?? ''
	}

	for (const seat of self.seats()) {
		const seatState = state.seats.get(seat)
		values[`seat_${seat}_mic`] = seatState ? (seatState.microphoneOn ? 'on' : 'off') : '-'
		values[`seat_${seat}_request`] = seatState ? (seatState.requestingToSpeak ? 'on' : 'off') : '-'
		values[`seat_${seat}_role`] = seatState?.role ?? '-'
		values[`seat_${seat}_online`] = state.online.has(seat) ? 'online' : 'offline'
	}

	self.setVariableValues(values)
}
