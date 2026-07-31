import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const config = await generateEslintConfig({
	enableTypescript: true,
})

// The mock harness is a dev-only script: it runs on the local Node, not inside
// Companion, and imports from dist/ on purpose.
config.push({
	ignores: ['test/**'],
})

export default config
