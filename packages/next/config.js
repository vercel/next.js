let hasWarned = false

module.exports = (() => {
  if (!hasWarned) {
    console.warn(
      // ANSI code aligns with Next.js warning style from picocolors.
      ' \x1b[33m\x1b[1m⚠\x1b[22m\x1b[39m Runtime config is deprecated and will be removed in Next.js 16. Please remove the usage of "next/config" from your project.'
    )
    hasWarned = true
  }
  return require('./dist/shared/lib/runtime-config.external')
})()
