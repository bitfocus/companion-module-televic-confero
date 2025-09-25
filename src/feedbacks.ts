import { combineRgb } from '@companion-module/base'
import type { TelevicConferoInstance } from './main.js'
//import { resolve } from 'path'

export function UpdateFeedbacks(self: TelevicConferoInstance): void {
	self.setFeedbackDefinitions({
		micState: {
			name: 'Microphone State',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(255, 0, 0),
				color: combineRgb(0, 0, 0),
			},
			options: [
				{
					id: 'seatID',
					type: 'number',
					label: 'Seat',
					default: 1,
					min: 0,
					max: 200,
				},
			],
			callback: async (feedback) => {
				const status = await self.getSeatState(parseInt(feedback.options.seatID as string))
				self.log('debug', `seat status: ${feedback.options.seatID} - ${status}`)
				return status ? status : false
			},
			subscribe: async (feedback) => {
				await self.pollSubscribe(parseInt(feedback.options.seatID as string))
			},
			unsubscribe: async (feedback) => {
				await self.pollUnsubscribe(parseInt(feedback.options.seatID as string))
			},
		},
		requestState: {
			name: 'Microphone Request State',
			type: 'boolean',
			defaultStyle: {
				bgcolor: combineRgb(0, 255, 0),
				color: combineRgb(0, 255, 0),
			},
			options: [
				{
					id: 'seatID',
					type: 'number',
					label: 'Seat',
					default: 1,
					min: 0,
					max: 200,
				},
			],
			callback: async (feedback) => {
				const status = await self.getRequestSeat(parseInt(feedback.options.seatID as string))
				self.log('debug', `seat request status: ${feedback.options.seatID} - ${status}`)
				return status ? status : false
			},
			subscribe: async (feedback) => {
				await self.pollSubscribe(parseInt(feedback.options.seatID as string))
			},
			unsubscribe: async (feedback) => {
				await self.pollUnsubscribe(parseInt(feedback.options.seatID as string))
			},
		},
	})
}
