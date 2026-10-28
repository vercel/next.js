module.exports = process.env.ROUTING_CONFIG_RSPACK
  ? require('next-rspack')({})
  : {}
