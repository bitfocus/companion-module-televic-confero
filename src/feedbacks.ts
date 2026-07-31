import { combineRgb, type CompanionInputFieldNumber } from '@companion-module/base'
import type { MicrophoneMode, RecordingState, SeatRole } from './api.js'
import type { TelevicConferoInstance } from './main.js'

export const FEEDBACK_IDS = [
	'micOn',
	'requesting',
	'anyMicOn',
	'seatRole',
	'seatOnline',
	'recordingState',
	'micMode',
	'nextInLine',
	'audioConfigActive',
	'unitsOnlineBelow',
	'reordering',
] as const

const seatField: CompanionInputFieldNumber = {
	id: 'seat',
	type: 'number',
	label: 'Seat',
	default: 1,
	min: 1,
	max: 200,
}

const RED = combineRgb(200, 0, 0)
const GREEN = combineRgb(0, 160, 0)
const AMBER = combineRgb(200, 140, 0)
const BLACK = combineRgb(0, 0, 0)
const WHITE = combineRgb(255, 255, 255)

/**
 * Every callback reads the cache filled by the poll loop, so it is synchronous and free.
 */
export function UpdateFeedbacks(self: TelevicConferoInstance): void {
	const configChoices = self.getState().audioConfigs.map((c) => ({ id: c.id, label: c.name }))
	if (configChoices.length === 0) configChoices.push({ id: '', label: '(not read from the unit yet)' })

	self.setFeedbackDefinitions({
		micOn: {
			name: 'Microphone is open',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [seatField],
			callback: (feedback) => self.getSeatState(Number(feedback.options.seat))?.microphoneOn === true,
		},

		requesting: {
			name: 'Seat is requesting to speak',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [seatField],
			callback: (feedback) => self.getSeatState(Number(feedback.options.seat))?.requestingToSpeak === true,
		},

		anyMicOn: {
			name: 'At least one microphone is open',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [],
			callback: () => self.getState().speakers.length > 0,
		},

		seatRole: {
			name: 'Seat has role',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [
				seatField,
				{
					id: 'role',
					type: 'dropdown',
					label: 'Role',
					default: 'chairperson',
					choices: [
						{ id: 'chairperson', label: 'Chairperson' },
						{ id: 'vip', label: 'VIP' },
						{ id: 'delegate', label: 'Delegate' },
					],
				},
			],
			callback: (feedback) =>
				self.getSeatState(Number(feedback.options.seat))?.role === (feedback.options.role as SeatRole),
		},

		seatOnline: {
			name: 'Seat is online',
			type: 'boolean',
			defaultStyle: { bgcolor: BLACK, color: WHITE },
			options: [seatField],
			callback: (feedback) => self.getState().online.has(Number(feedback.options.seat)),
		},

		recordingState: {
			name: 'Recording is in state',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{
					id: 'state',
					type: 'dropdown',
					label: 'State',
					default: 'recording',
					choices: [
						{ id: 'recording', label: 'Recording' },
						{ id: 'paused', label: 'Paused' },
						{ id: 'idle', label: 'Idle' },
					],
				},
			],
			callback: (feedback) => self.getState().recording === (feedback.options.state as RecordingState),
		},

		nextInLine: {
			name: 'Seat is next in the request list',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [seatField],
			callback: (feedback) => self.getState().requests[0] === Number(feedback.options.seat),
		},

		audioConfigActive: {
			name: 'Audio configuration is active',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [
				{
					id: 'config',
					type: 'dropdown',
					label: 'Configuration',
					default: configChoices[0].id,
					choices: configChoices,
					allowCustom: true,
				},
			],
			callback: (feedback) => self.getState().audioConfigs.some((c) => c.id === feedback.options.config && c.isActive),
		},

		unitsOnlineBelow: {
			name: 'Fewer units online than expected',
			type: 'boolean',
			defaultStyle: { bgcolor: RED, color: WHITE },
			options: [
				{
					id: 'expected',
					type: 'number',
					label: 'Expected units online',
					default: 3,
					min: 1,
					max: 200,
					tooltip: 'Set this to the number of desks you rigged. Turns on as soon as one drops off.',
				},
			],
			callback: (feedback) => self.unitsOnline() < Number(feedback.options.expected),
		},

		reordering: {
			name: 'Seat reordering is active',
			type: 'boolean',
			defaultStyle: { bgcolor: AMBER, color: BLACK },
			options: [],
			callback: () => self.getState().reordering === 'reordering',
		},

		micMode: {
			name: 'Discussion is in microphone mode',
			type: 'boolean',
			defaultStyle: { bgcolor: GREEN, color: BLACK },
			options: [
				{
					id: 'micMode',
					type: 'dropdown',
					label: 'Mode',
					default: 'directSpeak',
					choices: [
						{ id: 'directSpeak', label: 'Direct speak' },
						{ id: 'request', label: 'Request' },
						{ id: 'group', label: 'Group' },
						{ id: 'operator', label: 'Operator' },
						{ id: 'handsFree', label: 'Hands free' },
					],
				},
			],
			callback: (feedback) => self.getState().settings?.microphoneMode === (feedback.options.micMode as MicrophoneMode),
		},
	})
}
