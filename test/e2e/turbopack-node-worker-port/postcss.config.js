// A PostCSS config forces Turbopack to transform the imported CSS in a pooled
// Node.js worker process, which is what makes the build depend on binding a
// local worker port.
module.exports = {
  plugins: {},
}
