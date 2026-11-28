// Returns the CSS unchanged, standing in for a CSS-to-CSS loader such as
// `@tailwindcss/turbopack`.
module.exports = function passthroughLoader(source) {
  return source
}
