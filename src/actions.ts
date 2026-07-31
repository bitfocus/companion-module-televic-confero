import type { CompanionInputFieldDropdown, CompanionInputFieldNumber } from '@companion-module/base'
import {
	optionsForMode,
	type ActivationType,
	type MicrophoneMode,
	type RecordingState,
	type ReorderingState,
} from './api.js'
import type { TelevicConferoInstance } from './main.js'
import { dbToGain } from './state.js'

const seatField: CompanionInputFieldNumber = {
	id: 'seat',
	type: 'number',
	label: 'Seat',
	default: 1,
	min: 1,
	max: 200,
}

const stateField: CompanionInputFieldDropdown = {
	id: 'mode',
	type: 'dropdown',
	label: 'Action',
	default: 'toggle',
	choices: [
		{ id: 'on', label: 'On' },
		{ id: 'off', label: 'Off' },
		{ id: 'toggle', label: 'Toggle' },
	],
}

const MIC_MODES: Array<{ id: MicrophoneMode; label: string }> = [
	{ id: 'directSpeak', label: 'Direct speak' },
	{ id: 'request', label: 'Request' },
	{ id: 'group', label: 'Group' },
	{ id: 'operator', label: 'Operator' },
	{ id: 'handsFree', label: 'Hands free' },
]

/** Resolves on/off/toggle against the cached value. */
function resolve(mode: unknown, current: boolean): boolean {
	if (mode === 'on') return true
	if (mode === 'off') return false
	return !current
}

export function UpdateActions(self: TelevicConferoInstance): void {
	const configChoices = self.getState().audioConfigs.map((c) => ({ id: c.id, label: c.name }))
	if (configChoices.length === 0) configChoices.push({ id: '', label: '(not read from the unit yet)' })

	self.setActionDefinitions({
		setMicState: {
			name: 'Microphone: on / off / toggle',
			options: [seatField, stateField],
			callback: async ({ options }) => {
				const seat = Number(options.seat)
				const current = self.getSeatState(seat)
				const microphoneOn = resolve(options.mode, current?.microphoneOn ?? false)
				// Both fields are sent because some firmwares reject a partial body, but the
				// request-to-speak value comes from the cache so it is preserved, not cleared.
				await self.run(`Seat ${seat} microphone ${microphoneOn ? 'on' : 'off'}`, async (api) =>
					api.setSeat(seat, { microphoneOn, requestingToSpeak: current?.requestingToSpeak ?? false }),
				)
			},
		},

		setRequestState: {
			name: 'Request to speak: on / off / toggle',
			options: [seatField, stateField],
			callback: async ({ options }) => {
				const seat = Number(options.seat)
				const current = self.getSeatState(seat)
				const requestingToSpeak = resolve(options.mode, current?.requestingToSpeak ?? false)
				await self.run(`Seat ${seat} request ${requestingToSpeak ? 'on' : 'off'}`, async (api) =>
					api.setSeat(seat, { microphoneOn: current?.microphoneOn ?? false, requestingToSpeak }),
				)
			},
		},

		grantNextRequest: {
			name: 'Floor: give it to the next seat in the request list',
			options: [],
			callback: async () => {
				const next = self.getState().requests[0]
				if (next === undefined) {
					self.log('info', 'Nobody is requesting the floor')
					return
				}
				await self.run(`Floor to seat ${next}`, async (api) =>
					api.setSeat(next, { microphoneOn: true, requestingToSpeak: false }),
				)
			},
		},

		stopFirstSpeaker: {
			name: 'Floor: close the microphone that has been open the longest',
			options: [],
			callback: async () => {
				const first = self.getState().speakers[0]
				if (first === undefined) {
					self.log('info', 'No microphone is open')
					return
				}
				await self.run(`Close seat ${first}`, async (api) =>
					api.setSeat(first, {
						microphoneOn: false,
						requestingToSpeak: self.getSeatState(first)?.requestingToSpeak ?? false,
					}),
				)
			},
		},

		soloSeat: {
			name: 'Floor: give it to one seat only (solo)',
			options: [seatField],
			callback: async ({ options }) => {
				const seat = Number(options.seat)
				await self.run(`Solo seat ${seat}`, async (api) => {
					// Close the others first, so the unit never briefly exceeds its speaker limit.
					for (const open of self.getState().speakers) {
						if (open === seat) continue
						await api.setSeat(open, {
							microphoneOn: false,
							requestingToSpeak: self.getSeatState(open)?.requestingToSpeak ?? false,
						})
					}
					await api.setSeat(seat, { microphoneOn: true, requestingToSpeak: false })
				})
			},
		},

		clearSpeakers: {
			name: 'Clear all speakers',
			options: [],
			callback: async () => {
				await self.run('Clear all speakers', async (api) => api.clearSpeakers())
			},
		},

		clearDelegateSpeakers: {
			name: 'Clear delegate speakers (keeps chairpersons)',
			options: [],
			callback: async () => {
				await self.run('Clear delegate speakers', async (api) => api.clearDelegateSpeakers())
			},
		},

		clearRequests: {
			name: 'Clear the request-to-speak list',
			options: [],
			callback: async () => {
				await self.run('Clear requests', async (api) => api.clearRequests())
			},
		},

		setMicMode: {
			name: 'Discussion: microphone mode',
			options: [
				{
					id: 'micMode',
					type: 'dropdown',
					label: 'Mode',
					default: 'directSpeak',
					choices: MIC_MODES,
				},
				{
					id: 'activation',
					type: 'dropdown',
					label: 'Microphone activation',
					default: 'toggle',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'push', label: 'Push to talk' },
						{ id: 'vox', label: 'Voice activated (group mode only)' },
					],
					tooltip: 'Only used by direct speak and group mode.',
				},
			],
			callback: async ({ options }) => {
				const micMode = String(options.micMode) as MicrophoneMode
				const activation = String(options.activation ?? 'toggle') as ActivationType
				await self.run(`Microphone mode ${micMode}`, async (api) => {
					// The unit expects the whole settings object back, and rejects options
					// belonging to the previous mode, so they are rebuilt for the target mode.
					const settings = self.getState().settings ?? (await api.getDiscussionSettings())
					if (!settings) throw new Error('Could not read the current discussion settings')
					await api.setDiscussionSettings({
						maximumNumberOfSpeakers: settings.maximumNumberOfSpeakers,
						microphoneMode: micMode,
						options: optionsForMode(micMode, settings.options, activation),
					})
				})
			},
		},

		setMaxSpeakers: {
			name: 'Discussion: maximum number of open microphones',
			options: [
				{
					id: 'value',
					type: 'number',
					label: 'Maximum',
					default: 4,
					min: 1,
					max: 16,
				},
			],
			callback: async ({ options }) => {
				const value = Number(options.value)
				await self.run(`Maximum speakers ${value}`, async (api) => {
					const settings = self.getState().settings ?? (await api.getDiscussionSettings())
					if (!settings) throw new Error('Could not read the current discussion settings')
					await api.setDiscussionSettings({ ...settings, maximumNumberOfSpeakers: value })
				})
			},
		},

		startMeeting: {
			name: 'Meeting: start from local template (Plixus / Confero)',
			options: [],
			callback: async () => {
				// Flagged optional: /api/meeting answers 404 on a D-Cerno AE, and pressing
				// the button there should log a line, not put the connection in error.
				await self.run('Start meeting', async (api) => api.startLocalMeeting(), true)
			},
		},

		stopMeeting: {
			name: 'Meeting: stop (Plixus / Confero)',
			options: [],
			callback: async () => {
				await self.run('Stop meeting', async (api) => api.stopMeeting(), true)
			},
		},

		setRecording: {
			name: 'Recording: set state',
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'recording',
					choices: [
						{ id: 'recording', label: 'Recording' },
						{ id: 'paused', label: 'Paused' },
						{ id: 'idle', label: 'Idle (stop)' },
					],
				},
			],
			callback: async ({ options }) => {
				const state = String(options.state) as RecordingState
				await self.run(`Recording ${state}`, async (api) => api.setRecordingState(state))
			},
		},

		toggleRecording: {
			name: 'Recording: toggle',
			options: [],
			callback: async () => {
				const current = self.getState().recording
				const next: RecordingState = current === 'recording' ? 'idle' : 'recording'
				await self.run(`Recording ${next}`, async (api) => api.setRecordingState(next))
			},
		},

		setLoudspeakerVolume: {
			name: 'Audio: loudspeaker volume (absolute)',
			options: [
				{
					id: 'db',
					type: 'number',
					label: 'Gain (dB)',
					default: -6,
					min: -80,
					max: 20,
				},
			],
			callback: async ({ options }) => {
				const db = Number(options.db)
				await self.run(`Loudspeaker volume ${db} dB`, async (api) => api.setLoudspeakerVolume(dbToGain(db)))
			},
		},

		adjustLoudspeakerVolume: {
			name: 'Audio: loudspeaker volume (relative)',
			options: [
				{
					id: 'delta',
					type: 'number',
					label: 'Change by (dB)',
					default: 1,
					min: -20,
					max: 20,
				},
			],
			callback: async ({ options }) => {
				const delta = Number(options.delta)
				await self.run(`Loudspeaker volume ${delta > 0 ? '+' : ''}${delta} dB`, async (api) => {
					const current = self.getState().loudspeakerGain ?? (await api.getLoudspeakerVolume())
					if (current === undefined) throw new Error('Could not read the current loudspeaker volume')
					await api.setLoudspeakerVolume(current + dbToGain(delta))
				})
			},
		},

		setChannelSelectorVolume: {
			name: 'Audio: default channel selector volume (absolute)',
			options: [
				{
					id: 'db',
					type: 'number',
					label: 'Gain (dB)',
					default: -6,
					min: -80,
					max: 20,
				},
			],
			callback: async ({ options }) => {
				const db = Number(options.db)
				await self.run(`Channel selector volume ${db} dB`, async (api) => api.setChannelSelectorVolume(dbToGain(db)))
			},
		},

		adjustChannelSelectorVolume: {
			name: 'Audio: default channel selector volume (relative)',
			options: [
				{
					id: 'delta',
					type: 'number',
					label: 'Change by (dB)',
					default: 1,
					min: -20,
					max: 20,
				},
			],
			callback: async ({ options }) => {
				const delta = Number(options.delta)
				await self.run(`Channel selector volume ${delta > 0 ? '+' : ''}${delta} dB`, async (api) => {
					const current = self.getState().channelSelectorGain ?? (await api.getChannelSelectorVolume())
					if (current === undefined) throw new Error('Could not read the current channel selector volume')
					await api.setChannelSelectorVolume(current + dbToGain(delta))
				})
			},
		},

		setInputSensitivity: {
			name: 'Audio: microphone input sensitivity offset',
			options: [
				seatField,
				{
					id: 'offset',
					type: 'number',
					label: 'Offset (dB)',
					default: 0,
					min: -12,
					max: 12,
				},
			],
			callback: async ({ options }) => {
				const seat = Number(options.seat)
				const offset = Number(options.offset)
				await self.run(`Seat ${seat} sensitivity ${offset} dB`, async (api) =>
					api.setInputSensitivityOffset(seat, offset),
				)
			},
		},

		activateAudioConfig: {
			name: 'Audio: activate a configuration',
			options: [
				{
					id: 'config',
					type: 'dropdown',
					label: 'Configuration',
					default: configChoices[0].id,
					choices: configChoices,
					allowCustom: true,
					tooltip: 'The list is read from the unit. Custom values are accepted as a configuration id.',
				},
			],
			callback: async ({ options }) => {
				const id = String(options.config)
				if (!id) {
					self.log('warn', 'No audio configuration selected')
					return
				}
				const name = self.getState().audioConfigs.find((c) => c.id === id)?.name ?? id
				await self.run(`Audio configuration ${name}`, async (api) => api.activateAudioConfiguration(id))
			},
		},

		pushChannelSelectorVolume: {
			name: 'Audio: push the default volume to every channel selector',
			options: [],
			callback: async () => {
				await self.run('Push channel selector volume', async (api) => api.pushChannelSelectorVolume())
			},
		},

		setReorderingState: {
			name: 'System: seat reordering mode',
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'reordering',
					choices: [
						{ id: 'reordering', label: 'Reordering' },
						{ id: 'idle', label: 'Idle' },
					],
				},
			],
			callback: async ({ options }) => {
				const state = String(options.state) as ReorderingState
				await self.run(`Seat reordering ${state}`, async (api) => api.setReorderingState(state))
			},
		},

		reboot: {
			name: 'System: reboot the central unit',
			options: [
				{
					id: 'confirm',
					type: 'checkbox',
					label: 'Yes, really reboot',
					default: false,
				},
			],
			callback: async ({ options }) => {
				if (!options.confirm) {
					self.log('warn', 'Reboot ignored: the confirmation box is not ticked')
					return
				}
				await self.run('Reboot', async (api) => api.reboot())
			},
		},
	})
}
