module.exports = {
  testMatch: ['**/*.test.js', '**/*.test.ts', '**/*.test.tsx'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup-after-env.ts'],
  verbose: true,
  rootDir: 'test',
  modulePaths: ['<rootDir>/lib'],
  transformIgnorePatterns: ['/node_modules/', '/next[/\\\\]dist/'],
  transform: {
    '.+\\.(t|j)sx?$': [
      // this matches our SWC options used in https://github.com/vercel/next.js/blob/canary/packages/next/taskfile-swc.js
      '@swc/jest',
      {
        sourceMaps: 'inline',
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
