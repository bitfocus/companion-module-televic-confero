// import { Regex } from '@companion-module/base'
import type { TelevicConferoInstance } from './main.js'

export function UpdateActions(self: TelevicConferoInstance): void {
	self.setActionDefinitions({
		setSeatState: {
			name: 'Set Microphone State',
			options: [
				{
					id: 'seatID',
					type: 'number',
					label: 'Seat Number',
					default: 1,
					min: 1,
					max: 200,
				},
				{
					id: 'tate',
					type: 'checkbox',
					label: 'State',
					default: true,
				},
				{
					id: 'request',
					type: 'checkbox',
					label: 'Request',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const seatID = options.seatID as string
				const state = options.state as string
				const request = options.request as string
				self.log('debug', `Set Microphone State  ${seatID} to ${state} [${request}]`)
				await self.setSeatState(parseInt(seatID), JSON.parse(state), JSON.parse(request))
			},
		},
		startMeeting: {
			name: 'Start a Local meeting',
			options: [],
			callback: async () => {
				await self.startMeeting()
				self.log('debug', 'Meeting Started')
			},
		},
		stopMeeting: {
			name: 'Stop a meeting',
			options: [],
			callback: async () => {
				await self.stopMeeting()
				self.log('debug', 'Meeting Stopped')
			},
		},
		RecordingState: {
			name: 'Handle Recording',
			options: [
				{
					id: 'state',
					type: 'checkbox',
					label: 'State',
					default: true,
				},
			],
			callback: async ({ options }) => {
				const state = options.state as string
				await self.SetRecording(state)
				self.log('debug', `Recording ${state}`)
			},
		},
	})
}
