// A loader that is only wired up inside the `my-ctx` derived context (via
// `experimental.turbopackContexts.my-ctx.rules`). When it runs it replaces the module's content,
// which lets the test assert whether the context's rules were applied.
module.exports = function (content, _map, _meta) {
  return `export default ${JSON.stringify('transformed-by-context-loader')}`
}
