// Test config with both warnings (unknown keys) and hard errors (images config error)
module.exports = {
  // This should be a warning - unknown experimental key
  experimental: {
    unknownExperimentalOption: true,
    anotherUnknownOption: 'test',
  },

  // This should be a hard error - invalid images config
  images: {
    invalidOption: 'bad value',
  },
}
