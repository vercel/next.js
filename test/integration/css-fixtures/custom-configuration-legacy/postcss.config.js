module.exports = {
  // Use comments to test JSON5 support
  plugins: [
    // Test a non-standard feature that wouldn't be normally enabled
    require('postcss-short-size')({
      // Add a prefix to test that configuration is passed
      prefix: 'xyz',
    }),
  ],
}
