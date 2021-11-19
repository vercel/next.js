const nextJest = require('next/jest')

// Provide the path to your Next.js app which will enable loading next.config.js and .env files
const createJestConfig = nextJest()

// Add any custom config you want to pass to Jest
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    // Handle module aliases, this will be automatically configured for you soon.
    '^@/components/(.*)$': '<rootDir>/components/$1',
  },
}
// createJestConfig is exported this way to ensure that next/jest can load the Next.js config which is async
module.exports = createJestConfig(customJestConfig)
