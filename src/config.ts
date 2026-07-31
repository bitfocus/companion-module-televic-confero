import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface TelevicConferoConfig {
	host: string
	port: number
	token: string
	useHttps: boolean
	allowSelfSigned: boolean
	seatCount: number
	pollInterval: number
	timeout: number
	useEvents: boolean
	verbose: boolean
}

export const DEFAULT_SEAT_COUNT = 16

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			width: 12,
			label: 'D-Cerno AE',
			value:
				'Controls a Televic D-Cerno AE central unit over its REST API. This is not the module for a D-Cerno CU/CUR — those speak TCCP on TCP 5011 and need the televic-dcerno module instead.',
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'D-Cerno AE IP',
			width: 6,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			width: 3,
			min: 1,
			max: 65535,
			default: 9080,
			tooltip: 'Default is 9080 over HTTP, 9443 over HTTPS.',
		},
		{
			type: 'number',
			id: 'timeout',
			label: 'Request timeout (ms)',
			width: 3,
			min: 500,
			max: 30000,
			default: 4000,
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'API bearer token',
			width: 12,
			tooltip: 'Generated in the web GUI: Technician > Settings > API settings > Generate API Token.',
		},
		{
			type: 'checkbox',
			id: 'useHttps',
			label: 'Use HTTPS',
			width: 3,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'allowSelfSigned',
			label: 'Allow self-signed certificate',
			width: 4,
			default: false,
			isVisibleExpression: '$(options.useHttps) === true',
		},
		{
			type: 'number',
			id: 'seatCount',
			label: 'Seats before discovery',
			width: 3,
			min: 1,
			max: 200,
			default: DEFAULT_SEAT_COUNT,
			tooltip:
				'Only used until the unit answers. Variables and presets then follow the real seat numbers reported by the AE, which are often not 1..N.',
		},
		{
			type: 'number',
			id: 'pollInterval',
			label: 'Poll interval (ms)',
			width: 3,
			min: 200,
			max: 10000,
			default: 1000,
			tooltip: 'One request per tick covers the whole room, so this can stay low without flooding the unit.',
		},
		{
			type: 'checkbox',
			id: 'useEvents',
			label: 'Real-time events (long polling)',
			width: 6,
			default: true,
			tooltip:
				'Subscribes to /api/notification/events for immediate updates instead of waiting for the next poll. Falls back to polling on its own if the firmware does not expose it.',
		},
		{
			type: 'checkbox',
			id: 'verbose',
			label: 'Verbose logging',
			width: 3,
			default: false,
		},
	]
}
