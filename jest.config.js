module.exports = {
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  verbose: true,
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  globalSetup: '<rootDir>/jest-global-setup.js',
  globalTeardown: '<rootDir>/jest-global-teardown.js',
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.js'],
  testEnvironment: '<rootDir>/jest-environment.js',
  transformIgnorePatterns: ['/node_modules/', '/next[/\\\\]dist/'],
  transform: {
    '.+\\.(t|j)sx?$': [
      // this matches our SWC options used in https://github.com/vercel/next.js/blob/canary/packages/next/taskfile-swc.js
      '@swc/jest',
      {
        module: {
          type: 'commonjs',
        },
        env: {
          targets: {
            node: '12.0.0',
          },
        },
        jsc: {
          loose: true,

          parser: {
            syntax: 'typescript',
            dynamicImport: true,
            tsx: true,
          },
          transform: {
            react: {
              pragma: 'React.createElement',
              pragmaFrag: 'React.Fragment',
              throwIfNamespace: true,
              development: false,
              useBuiltins: true,
            },
          },
        },
      },
    ],
  },
}
