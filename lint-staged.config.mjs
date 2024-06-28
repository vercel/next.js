export default {
	'*.{js,jsx,mjs,ts,tsx,mts}': ['biome format --write', 'eslint --fix'],
	'*.{json,md,mdx,css,html,yml,yaml,scss}': ['biome format --write'],
	'*.rs': ['cargo fmt --'],
}
