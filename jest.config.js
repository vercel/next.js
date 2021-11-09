const path = require('path')

module.exports = {
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.ts'],
  verbose: true,
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  transformIgnorePatterns: ['/node_modules/', '/next[/\\\\]dist/', '/.next/'],
  transform: {
    '.+\\.(t|j)sx?$': [
      // this matches our SWC options used in https://github.com/vercel/next.js/blob/canary/packages/next/taskfile-swc.js
      path.join(__dirname, './packages/next/jest.js'),
    ],
  },
}
