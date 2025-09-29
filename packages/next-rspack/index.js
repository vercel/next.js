module.exports = function withRspack(config) {
  process.env.NEXT_RSPACK = 'true'
  process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
  if (process.env.TURBOPACK === 'auto') {
    // If next has defaulted to turbopack, override it.
    delete process.env.TURBOPACK
  } else if (process.env.TURBOPACK) {
    console.error('Cannot call withRspack and pass the --turbopack flag.')
    console.error('Please configure only one bundler.')
    process.exit(1)
  }
  return config
}
