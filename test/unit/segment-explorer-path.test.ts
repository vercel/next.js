import {
  BUILTIN_PREFIX,
  normalizeConventionFilePath,
  normalizeFilePath,
} from '../../packages/next/src/server/app-render/segment-explorer-path'

describe('segment explorer path normalization', () => {
  const cwd = process.cwd()

  describe('normalizeFilePath', () => {
    it.each([
      {
        name: 'absolute project path',
        projectDir: `${cwd}/apps/site`,
        filePath: `${cwd}/apps/site/src/app/dashboard/page.tsx`,
        expected: 'src/app/dashboard/page.tsx',
      },
      {
        name: 'Turbopack project prefix',
        projectDir: cwd,
        filePath: '[project]/app/blog/[slug]/page.tsx',
        expected: 'app/blog/[slug]/page.tsx',
      },
      {
        name: 'monorepo project prefix',
        projectDir: `${cwd}/apps/site`,
        filePath: '[project]/apps/site/src/app/page.tsx',
        expected: 'src/app/page.tsx',
      },
      {
        name: 'project directory embedded in a parent-relative path',
        projectDir: '/tmp/next-test-abc',
        filePath: 'test/tmp/next-test-abc/app/page.js',
        // Removing the embedded absolute project path preserves its `test` prefix.
        expected: 'test/app/page.js',
      },
      {
        name: 'Windows separators',
        projectDir: 'C:\\repo\\site',
        filePath: 'C:\\repo\\site\\src\\app\\page.tsx',
        expected: 'src/app/page.tsx',
      },
      {
        name: 'missing file path',
        projectDir: cwd,
        filePath: undefined,
        expected: '',
      },
    ])('$name', ({ projectDir, filePath, expected }) => {
      expect(normalizeFilePath(projectDir, filePath)).toBe(expected)
    })
  })

  describe('normalizeConventionFilePath', () => {
    it.each([
      ['app/page.tsx', 'page.tsx'],
      ['src/app/dashboard/layout.tsx', 'dashboard/layout.tsx'],
      [
        `${cwd}/node_modules/next/dist/client/components/builtin/global-error.js`,
        `${BUILTIN_PREFIX}global-error.js`,
      ],
      [
        '[project]/app/next/dist/client/components/builtin/not-found.js',
        `${BUILTIN_PREFIX}not-found.js`,
      ],
    ])('normalizes %s', (filePath, expected) => {
      expect(normalizeConventionFilePath(cwd, filePath)).toBe(expected)
    })
  })
})
