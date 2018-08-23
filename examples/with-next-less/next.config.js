const withLess = require('@zeit/next-less')

/* Without CSS Modules, with PostCSS */
module.exports = withLess()

/* With CSS Modules */
// module.exports = withLess({ cssModules: true })

/* With additional configuration on top of CSS Modules */
/*
module.exports = withLess({
  cssModules: true,
  webpack: function (config) {
    return config;
  }
});
*/
