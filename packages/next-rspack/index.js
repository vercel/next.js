Error.stackTraceLimit = 100
module.exports = function withRspack(config) {
  if (process.env.NEXT_RSPACK) {
    // we have already been called.  This can happen when using build workers.
    return config
  }
  if (process.env.TURBOPACK === 'auto') {
    delete process.env.TURBOPACK
    process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
    process.env.NEXT_RSPACK = 'true'
  } else {
    // Either The TURBOPACK flag wasn't set which means --wepack was, or the TURBOPACK flag was set to 1 because --turbopack was passed.
    console.trace(
      `Cannot call withRspack and pass the ${process.env.TURBOPACK ? '--turbopack' : '--webpack'} flag.`
    )
    console.error('Please configure only one bundler.')
    process.exit(1)
  }
  return config
}
