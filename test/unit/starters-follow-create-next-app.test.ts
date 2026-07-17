/* eslint-env jest */
import fs from 'fs'
import path from 'path'

// Starters must not drift from what create-next-app generates: their
// baseline config files are byte-for-byte copies of the app-tw template.
// When the template changes, this test fails until the starters follow.
const TEMPLATE_DIR = path.join(
  __dirname,
  '../../packages/create-next-app/templates/app-tw/ts'
)
const STARTERS_DIR = path.join(__dirname, '../../starters')

// starter path -> template path. Matched exactly, so starters can't drift
// from what create-next-app generates.
const BASELINE_FILES: Record<string, string> = {
  'postcss.config.mjs': 'postcss.config.mjs',
  'eslint.config.mjs': 'eslint.config.mjs',
  'app/globals.css': 'app/globals.css',
}

// `.gitignore` starts from the template but may append project-specific
// entries (for example Playwright artifacts), so it's matched as a prefix.
const PREFIXED_FILES: Record<string, string> = {
  '.gitignore': 'gitignore',
}

const starters = fs
  .readdirSync(STARTERS_DIR, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe('starters follow the create-next-app template', () => {
  it('finds at least one starter', () => {
    expect(starters.length).toBeGreaterThan(0)
  })

  describe.each(starters)('%s', (starter) => {
    it.each(Object.entries(BASELINE_FILES))(
      '%s matches the app-tw template',
      (starterFile, templateFile) => {
        const actual = fs.readFileSync(
          path.join(STARTERS_DIR, starter, starterFile),
          'utf-8'
        )
        const expected = fs.readFileSync(
          path.join(TEMPLATE_DIR, templateFile),
          'utf-8'
        )
        expect(actual).toBe(expected)
      }
    )

    it.each(Object.entries(PREFIXED_FILES))(
      '%s starts from the app-tw template',
      (starterFile, templateFile) => {
        const actual = fs.readFileSync(
          path.join(STARTERS_DIR, starter, starterFile),
          'utf-8'
        )
        const expected = fs.readFileSync(
          path.join(TEMPLATE_DIR, templateFile),
          'utf-8'
        )
        expect(actual.startsWith(expected)).toBe(true)
      }
    )

    // tsconfig matches the template's compilerOptions and include; the
    // starter only extends `exclude` to keep the e2e tests out of the build.
    it('tsconfig matches the app-tw template (excludes may extend)', () => {
      const actual = JSON.parse(
        fs.readFileSync(
          path.join(STARTERS_DIR, starter, 'tsconfig.json'),
          'utf-8'
        )
      )
      const expected = JSON.parse(
        fs.readFileSync(path.join(TEMPLATE_DIR, 'tsconfig.json'), 'utf-8')
      )
      expect(actual.compilerOptions).toEqual(expected.compilerOptions)
      expect(actual.include).toEqual(expected.include)
      for (const entry of expected.exclude) {
        expect(actual.exclude).toContain(entry)
      }
    })
  })
})
