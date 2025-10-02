module.exports = function withRspack(config) {
  process.env.NEXT_RSPACK = 'true'
  process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
  if (process.env.TURBOPACK === 'auto') {
    // If next has defaulted to turbopack, override it.
    delete process.env.TURBOPACK
  } else {
    console.error(
      `Cannot call withRspack and pass the ${process.env.TURBOPACK ? '--turbopack' : '--webpack'} flag.`
    )
    console.error('Please configure only one bundler.')
    process.exit(1)
  }
  return config
}
