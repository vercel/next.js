module.exports = function withRspack(config) {
  process.env.NEXT_RSPACK = 'true'
  process.env.RSPACK_CONFIG_VALIDATE = 'loose-silent'
  return config
}
