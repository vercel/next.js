module.exports = {
  experimental: {
    nonJsBots: process.env.NON_JS_BOTS_REGEX
      ? new RegExp(process.env.NON_JS_BOTS_REGEX, 'i')
      : undefined,
  },
}
