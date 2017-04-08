module.exports = () => ({
  // The list of plugins for PostCSS
  // https://github.com/postcss/postcss
  plugins: [
    // Transfer @global-import rule by inlining content with :global CSS Modules scope
    // e.g. @global-import 'draft-js/dist/Draft.css'
    // https://github.com/scherebedov/postcss-global-import
    require('postcss-global-import')(),
    // Transfer @import rule by inlining content, e.g. @import 'normalize.css'
    // https://github.com/postcss/postcss-import
    require('postcss-import')(), // Add vendor prefixes to CSS rules using values from caniuse.com
    // https://github.com/postcss/autoprefixer
    require('autoprefixer')(/* package.json/browserslist */)
  ]
})
