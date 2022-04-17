const WindiCSS = require('windicss-webpack-plugin');

/**
 * @type {import('next').NextConfig}
 */
module.exports = {
	webpack(config) {
		config.plugins.push(new WindiCSS());
		return config;
	},
};