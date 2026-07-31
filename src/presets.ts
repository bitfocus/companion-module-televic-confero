import {
	combineRgb,
	type CompanionButtonPresetDefinition,
	type CompanionPresetDefinitions,
} from '@companion-module/base'
import type { TelevicConferoInstance } from './main.js'

const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)
const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 160, 0)
const DARK = combineRgb(20, 20, 20)

/** Presets are capped so a 200-seat configuration does not flood the preset list. */
const MAX_SEAT_PRESETS = 24
/** Manifest shortname; Companion rewrites it with the connection label on import. */
const VAR = 'dcerno'

export function UpdatePresets(self: TelevicConferoInstance): void {
	const presets: CompanionPresetDefinitions = {}
	// Only the seats with a unit plugged in, so a room configured for 44 seats with three
	// desks connected gets three buttons that work rather than a wall of dead ones.
	const seats = self.onlineSeats().slice(0, MAX_SEAT_PRESETS)

	for (const seat of seats) {
		const preset: CompanionButtonPresetDefinition = {
			type: 'button',
			category: 'Microphones',
			name: `Seat ${seat} microphone toggle`,
			style: {
				text: `MIC\\n${seat}`,
				size: '18',
				color: WHITE,
				bgcolor: DARK,
			},
			steps: [
				{
					down: [{ actionId: 'setMicState', options: { seat, mode: 'toggle' } }],
					up: [],
				},
			],
			feedbacks: [
				{
					feedbackId: 'micOn',
					options: { seat },
					style: { bgcolor: RED, color: WHITE },
				},
				{
					feedbackId: 'requesting',
					options: { seat },
					style: { bgcolor: GREEN, color: BLACK },
				},
			],
		}
		presets[`seat_${seat}_toggle`] = preset
	}

	presets['all_off'] = {
		type: 'button',
		category: 'Lists',
		name: 'Clear all speakers',
		style: { text: 'ALL\\nOFF', size: '18', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'clearSpeakers', options: {} }], up: [] }],
		feedbacks: [{ feedbackId: 'anyMicOn', options: {}, style: { bgcolor: RED, color: WHITE } }],
	}

	presets['delegates_off'] = {
		type: 'button',
		category: 'Lists',
		name: 'Clear delegate speakers',
		style: { text: 'DELEG\\nOFF', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'clearDelegateSpeakers', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['clear_requests'] = {
		type: 'button',
		category: 'Lists',
		name: 'Clear the request list',
		style: { text: 'CLEAR\\nREQ', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'clearRequests', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['recording_toggle'] = {
		type: 'button',
		category: 'Recording',
		name: 'Recording toggle',
		style: { text: 'REC', size: '18', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'toggleRecording', options: {} }], up: [] }],
		feedbacks: [
			{ feedbackId: 'recordingState', options: { state: 'recording' }, style: { bgcolor: RED, color: WHITE } },
			{
				feedbackId: 'recordingState',
				options: { state: 'paused' },
				style: { bgcolor: combineRgb(200, 140, 0), color: BLACK },
			},
		],
	}

	const modes: Array<[string, string]> = [
		['directSpeak', 'DIRECT'],
		['request', 'REQUEST'],
		['group', 'GROUP'],
		['operator', 'OPER'],
		['handsFree', 'HANDS\\nFREE'],
	]
	for (const [mode, label] of modes) {
		presets[`mode_${mode}`] = {
			type: 'button',
			category: 'Discussion modes',
			name: `Microphone mode: ${mode}`,
			style: { text: label, size: '14', color: WHITE, bgcolor: DARK },
			steps: [{ down: [{ actionId: 'setMicMode', options: { micMode: mode, activation: 'toggle' } }], up: [] }],
			feedbacks: [{ feedbackId: 'micMode', options: { micMode: mode }, style: { bgcolor: GREEN, color: BLACK } }],
		}
	}

	for (const config of self.getState().audioConfigs) {
		presets[`audio_config_${config.id}`] = {
			type: 'button',
			category: 'Audio configurations',
			name: `Activate "${config.name}"`,
			style: { text: config.name, size: '14', color: WHITE, bgcolor: DARK },
			steps: [{ down: [{ actionId: 'activateAudioConfig', options: { config: config.id } }], up: [] }],
			feedbacks: [
				{ feedbackId: 'audioConfigActive', options: { config: config.id }, style: { bgcolor: GREEN, color: BLACK } },
			],
		}
	}

	presets['grant_next'] = {
		type: 'button',
		category: 'Floor control',
		name: 'Give the floor to the next request',
		style: { text: `NEXT\\n$(${VAR}:request_1)`, size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'grantNextRequest', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['stop_first'] = {
		type: 'button',
		category: 'Floor control',
		name: 'Close the oldest open microphone',
		style: { text: `CLOSE\\n$(${VAR}:speaker_1)`, size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'stopFirstSpeaker', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['speaking_now'] = {
		type: 'button',
		category: 'Floor control',
		name: 'Display: seats speaking',
		style: {
			text: `SPEAK\\n$(${VAR}:active_seats)`,
			size: '14',
			color: WHITE,
			bgcolor: DARK,
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [{ feedbackId: 'anyMicOn', options: {}, style: { bgcolor: RED, color: WHITE } }],
	}

	presets['units_online'] = {
		type: 'button',
		category: 'Monitoring',
		name: 'Display: units online',
		style: {
			text: `UNITS\\n$(${VAR}:units_online)`,
			size: '14',
			color: WHITE,
			bgcolor: DARK,
		},
		steps: [{ down: [], up: [] }],
		feedbacks: [
			{
				feedbackId: 'unitsOnlineBelow',
				options: { expected: seats.length || 1 },
				style: { bgcolor: RED, color: WHITE },
			},
		],
	}

	presets['volume_rotary'] = {
		type: 'button',
		category: 'Audio',
		name: 'Loudspeaker volume (rotary)',
		style: { text: `VOL\\n$(${VAR}:loudspeaker_volume)dB`, size: '14', color: WHITE, bgcolor: DARK },
		options: { rotaryActions: true },
		steps: [
			{
				down: [],
				up: [],
				rotate_left: [{ actionId: 'adjustLoudspeakerVolume', options: { delta: -1 } }],
				rotate_right: [{ actionId: 'adjustLoudspeakerVolume', options: { delta: 1 } }],
			},
		],
		feedbacks: [],
	}

	presets['push_channel_selector'] = {
		type: 'button',
		category: 'Audio',
		name: 'Push the default volume to every channel selector',
		style: { text: 'PUSH\\nHP', size: '14', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'pushChannelSelectorVolume', options: {} }], up: [] }],
		feedbacks: [],
	}

	presets['volume_up'] = {
		type: 'button',
		category: 'Audio',
		name: 'Loudspeaker volume +1 dB',
		style: { text: 'VOL\\n+1', size: '18', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'adjustLoudspeakerVolume', options: { delta: 1 } }], up: [] }],
		feedbacks: [],
	}

	presets['volume_down'] = {
		type: 'button',
		category: 'Audio',
		name: 'Loudspeaker volume -1 dB',
		style: { text: 'VOL\\n-1', size: '18', color: WHITE, bgcolor: DARK },
		steps: [{ down: [{ actionId: 'adjustLoudspeakerVolume', options: { delta: -1 } }], up: [] }],
		feedbacks: [],
	}

	self.setPresetDefinitions(presets)
}
