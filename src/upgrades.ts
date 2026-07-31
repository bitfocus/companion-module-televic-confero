import type {
	CompanionMigrationAction,
	CompanionMigrationFeedback,
	CompanionStaticUpgradeScript,
} from '@companion-module/base'
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

/**
 * v1.2.0 added the polling, seat and event settings. An existing connection comes back
 * with them undefined, which would leave the poll loop with an interval of NaN.
 */
const addPollingFields: CompanionStaticUpgradeScript<TelevicConferoConfig> = (_context, props) => {
	const config = props.config as Partial<TelevicConferoConfig> | null
	let changed = false

	if (config) {
		const defaults: Partial<TelevicConferoConfig> = {
			seatCount: 16,
			pollInterval: 1000,
			timeout: 4000,
			useEvents: true,
			verbose: false,
		}
		for (const [key, value] of Object.entries(defaults)) {
			if (config[key as keyof TelevicConferoConfig] === undefined) {
				;(config as Record<string, unknown>)[key] = value
				changed = true
			}
		}
	}

	return {
		updatedConfig: changed ? (config as TelevicConferoConfig) : null,
		updatedActions: [],
		updatedFeedbacks: [],
	}
}

/**
 * v1.2.0 renamed the actions and feedbacks so microphones, requests and recording read
 * consistently, and turned the recording checkbox into a dropdown. Existing buttons are
 * remapped here rather than silently losing their action.
 */
const renameActionsAndFeedbacks: CompanionStaticUpgradeScript<TelevicConferoConfig> = (_context, props) => {
	const updatedActions: CompanionMigrationAction[] = []
	const updatedFeedbacks: CompanionMigrationFeedback[] = []

	for (const action of props.actions) {
		if (action.actionId === 'setSeatState') {
			// The old action wrote both fields at once; the closest equivalent is an
			// explicit on/off on the microphone, which now preserves the request flag.
			action.actionId = 'setMicState'
			action.options = {
				seat: Number(action.options.seatID ?? 1),
				mode: action.options.state ? 'on' : 'off',
			}
			updatedActions.push(action)
		} else if (action.actionId === 'RecordingState') {
			// The checkbox never worked: its boolean was compared against the string
			// 'true', so the action always sent 'idle'. Map it to the new dropdown.
			action.actionId = 'setRecording'
			action.options = { state: action.options.state ? 'recording' : 'idle' }
			updatedActions.push(action)
		}
	}

	for (const feedback of props.feedbacks) {
		if (feedback.feedbackId === 'micState' || feedback.feedbackId === 'requestState') {
			feedback.feedbackId = feedback.feedbackId === 'micState' ? 'micOn' : 'requesting'
			feedback.options = { seat: Number(feedback.options.seatID ?? 1) }
			updatedFeedbacks.push(feedback)
		}
	}

	return {
		updatedConfig: null,
		updatedActions,
		updatedFeedbacks,
	}
}

export const UpgradeScripts: CompanionStaticUpgradeScript<TelevicConferoConfig>[] = [
	upgradeAddHttpsFields,
	fixActionIdTypo,
	addPollingFields,
	renameActionsAndFeedbacks,
]
