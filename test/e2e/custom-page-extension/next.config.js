module.exports = (phase, { defaultConfig }) => ({
  // Append the custom extension to the default page extensions, to ensure that matching precedence
  // is by length.
  pageExtensions: [...defaultConfig.pageExtensions, 'page.js'],
})
