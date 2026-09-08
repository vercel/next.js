// Keep byte emitters in taskfile.js while giving the Rust scheduler the actual
// dependencies between release phases. Declarations consume source files and
// copied dependencies; they do not consume compiled JavaScript or runtime bundles.
module.exports = (recipes) => ({
  ...recipes,
  async build(task, opts) {
    await task.start('precompile', opts)
    await task.parallel(['ncc_react_refresh_utils', 'ncc_next_font'], opts)
    await task.parallel(['compile_javascript', 'generate_types'], opts)
  },
  async compile_javascript(task, opts) {
    await task.serial(['next_compile', 'next_bundle', 'capsize_metrics'], opts)
  },
})
