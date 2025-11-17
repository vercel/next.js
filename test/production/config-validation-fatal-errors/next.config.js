module.exports = {
  // This should be a warning - unknown experimental key
  experimental: {
    unknownExperimentalOption: true,
    anotherUnknownOption: 'test',
  },

  // This should be a fatal error - invalid images config
  images: {
    invalidOption: 'bad value',
  },
}
