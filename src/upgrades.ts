import type { CompanionStaticUpgradeScript } from '@companion-module/base'
import type { TelevicConferoConfig } from './config.js'

const upgradeAddHttpsFields: CompanionStaticUpgradeScript<TelevicConferoConfig> = (_context, props) => {
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

export const UpgradeScripts: CompanionStaticUpgradeScript<TelevicConferoConfig>[] = [upgradeAddHttpsFields]
