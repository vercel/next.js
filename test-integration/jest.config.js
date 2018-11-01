module.exports = {
  bail: true,
  displayName: 'puppeteer',
  preset: 'jest-puppeteer',
  modulePaths: ['./utils'],
  setupTestFrameworkScriptFile: './testSetupFile.js'
}
