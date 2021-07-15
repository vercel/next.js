// configuration that must be set for each project but does not change
const commonConfig = {
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': '<rootDir>/node_modules/babel-jest',
    '^.+\\.css$': '<rootDir>/config/jest/cssTransform.js',
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  moduleNameMapper: {
    '^.+\\.module\\.(css|sass|scss)$': 'identity-obj-proxy',
  },
}
module.exports = {
  // shared configuration for global features, such as coverage computation
  collectCoverageFrom: [
    '**/*.{js,jsx,ts,tsx}',
    '!**/*.d.ts',
    '!**/node_modules/**',
    // we have to explicitely exclude tests from coverage when using "projects" options
    // because Jest can't tell anymore which files is a test or not as it varies per environment
    '!**/__tests__/**/*.[jt]s?(x)',
    '!**/*.test.[jt]s?(x)',
    '!coverage/**',
    '!.next/**',
    // we exclude configuration files from coverage computation
    '!*.js',
    '!config/**',
  ],
  // configuration for each environment (client or server)
  projects: [
    {
      ...commonConfig,
      name: 'client',
      displayName: 'client',
      // testEnvironment: "jsdom", // defautl already
      testMatch: [
        '**/__tests__/(!server)/**/*.[jt]s?(x)',
        '**/__tests__/*.[jt]s?(x)',
        '**/!(*.server).test.[jt]s?(x)',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
      modulePaths: ['<rootDir>'],
    },
    {
      ...commonConfig,
      name: 'server',
      displayName: 'server',
      testEnvironment: 'node',
      testMatch: [
        '**/__tests__/server/**/*.[jt]s?(x)',
        '**/*.server.test.[jt]s?(x)',
      ],
      setupFilesAfterEnv: ['<rootDir>/jest.setup.server.js'],
    },
  ],
}
