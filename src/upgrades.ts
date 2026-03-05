import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { TelevicConferoConfig } from './config.js'

const upgradeAddHttpsFields: CompanionStaticUpgradeScript<TelevicConferoConfig> = (_context, props) => {
	//v1.1.0
	const config = props.config as any
	let changed = false

	if (config) {
		if (config && config.useHttps === undefined) {
			config.useHttps = false
			changed = true
		}

		if (config && config.allowSelfSigned === undefined) {
			config.allowSelfSigned = false
			changed = true
		}
	}

	return {
		updatedConfig: changed ? config : null,
		updatedActions: [],
		updatedFeedbacks: [],
	}
}

const fixActionIdTypo: CompanionStaticUpgradeScript<TelevicConferoConfig> = (_context, props) => {
	//v1.1.0
	const actions = props.actions as any
	let changed = false

	if (actions) {
		for (const action of actions) {
			if (action.id === 'setSeatState' && action.tate) {
				action.state = action.tate
				delete action.tate
				changed = true
			}
		}
	}

	return {
		updatedConfig: null,
		updatedActions: changed ? actions : [],
		updatedFeedbacks: [],
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<TelevicConferoConfig>[] = [
	upgradeAddHttpsFields,
	fixActionIdTypo,
]
