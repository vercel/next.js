export default {
	'*.{js,jsx,mjs,ts,tsx,mts}': [
		'biome format --no-errors-on-unmatched --write',
		'eslint --fix',
	],
	'*.{json,md,mdx,css,html,yml,yaml,scss}': [
		'biome format --no-errors-on-unmatched --write',
	],
	'*.rs': ['cargo fmt --'],
}
