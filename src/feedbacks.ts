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
			callback: (feedback) => {
				let status = self.getSeatState(parseInt(feedback.options.seatID as string))?.then (data => {
					console.log('seat status:', feedback.options.seatID , " -  ", data)
					return (data? data: false)
					})
				return Promise.resolve(status) 
			},
			subscribe: (feedback) => {
                self.pollSubscribe(parseInt(feedback.options.seatID as string))
            },
            unsubscribe: (feedback) => {
                self.Pollunsubscribe(parseInt(feedback.options.seatID as string) )
            },
		},
	})
}
