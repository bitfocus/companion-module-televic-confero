import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export interface TelevicConferoConfig {
	host: string
	port: number
	token: string
	useHttps: boolean
	allowSelfSigned: boolean
}

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'textinput',
			id: 'host',
			label: 'Confero IP',
			width: 8,
			regex: Regex.IP,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Target Port',
			width: 4,
			min: 1,
			max: 65535,
			default: 9080,
			tooltip: 'The default when using HTTP is 9080. When using HTTPS, the default port is 9443.',
		},
		{
			type: 'textinput',
			id: 'token',
			label: 'API Bearer token',
			width: 25,
		},
		{
			type: 'checkbox',
			id: 'useHttps',
			label: 'Use HTTPS',
			width: 6,
			default: false,
		},
		{
			type: 'checkbox',
			id: 'allowSelfSigned',
			label: 'Allow Self-Signed Certificate',
			width: 6,
			default: false,
			isVisibleExpression: '$(options.useHttps) === true',
		},
	]
}
