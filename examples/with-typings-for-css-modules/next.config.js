const withCSS = require('@zeit/next-css')

/* With additional configuration on top of CSS Modules */
module.exports = withCSS({
  cssModules: true,
  cssLoaderOptions: {
    camelCase: true,
    namedExport: true,
  },
  webpack(config, options) {
    if (!options.isServer) {
      /* Using next-css */
      for (let entry of options.defaultLoaders.css) {
        if (entry.loader === 'css-loader') {
          entry.loader = 'typings-for-css-modules-loader'
          break
        }
      }

      /* Using next-less */
      /*
      for (let entry of options.defaultLoaders.less) {
        if (entry.loader === 'css-loader') {
          entry.loader = 'typings-for-css-modules-loader';
          break;
        }
      }
      */

      /* Using next-sass */
      /*
      for (let entry of options.defaultLoaders.sass) {
        if (entry.loader === 'css-loader') {
          entry.loader = 'typings-for-css-modules-loader';
          break;
        }
      }
      */

      /* Using next-stylus */
      /*
      for (let entry of options.defaultLoaders.stylus) {
        if (entry.loader === 'css-loader') {
          entry.loader = 'typings-for-css-modules-loader';
          break;
        }
      }
      */
    }

    return config
  },
})
