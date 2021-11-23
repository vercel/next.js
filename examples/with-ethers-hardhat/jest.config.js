module.exports = {
  roots: ['<rootDir>'],
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  testPathIgnorePatterns: [
    '<rootDir>/web3',
    '<rootDir>/node_modules/',
    '<rootDir>/.next/',
    'setup.js',
    'utils',
  ],
  transformIgnorePatterns: [
    '/node_modules/',
    '^.+\\.module\\.(css|sass|scss)$',
  ],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', {presets: ['next/babel']}],
  },
  watchPlugins: [
    'jest-watch-typeahead/filename',
    'jest-watch-typeahead/testname',
  ],
  moduleNameMapper: {
    '\\.(css|less|sass|scss)$': 'identity-obj-proxy',
    '\\.(gif|ttf|eot|svg|png)$': '<rootDir>/test/__mocks__/fileMock.js',
    '@/typechain': '<rootDir>/typechain',
    '@/pages/(.*)': '<rootDir>/pages/$1',
    '@/components': '<rootDir>/components',
    '@/components/(.*)': '<rootDir>/components/$1',
  },
};
