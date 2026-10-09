const createConfig = require('../../jest.config')

module.exports = async () => ({
  ...(await createConfig()),
  roots: [
    '<rootDir>/../packages/next-upgrade/src/',
    '<rootDir>/../packages/next-upgrade/test/',
  ],
})
