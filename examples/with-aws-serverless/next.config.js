const path = require('path');


module.exports = {
    exportPathMap: () => {
        return {"/": { page: "/" }};
    },
    webpack: (config, { dev }) => {
        const oldEntry = config.entry;

        // config.entry = () =>
        //     oldEntry().then(entry => {
        //         entry['main.js'].push(path.resolve('./utils/offline'));
        //         return entry
        //     });

        /* Enable only in Production */
        if (!dev) {
            // Service Worker
            const SWPrecacheWebpackPlugin = require('sw-precache-webpack-plugin');
            config.plugins.push(
                new SWPrecacheWebpackPlugin({
                    cacheId: 'next-js-cache',
                    filepath: './static/sw.js',
                    minify: true,
                    staticFileGlobsIgnorePatterns: [/\.next\//],
                    staticFileGlobs: [
                        'static/**/*'
                    ],
                    runtimeCaching: [
                    ]
                })
            )
        }

        return config
    }
};