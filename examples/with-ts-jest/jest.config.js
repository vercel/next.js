module.exports = {
  preset: 'ts-jest',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig-jest.json'
    }
  },
  testEnvironment: 'jsdom',
  transform: {
    '\\.(css)$':
      '<rootDir>/jest/fileTransformer.js',
  },
  moduleNameMapper: {
    '^@/components/(.*)$': '<rootDir>/src/components/$1',
    '^@/styles/(.*)$': '<rootDir>/src/styles/$1',
  },
  setupFiles: [
    '<rootDir>/jest/jest.setup.js'
  ]
};