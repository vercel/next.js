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

// starter path -> template path
const BASELINE_FILES: Record<string, string> = {
  'tsconfig.json': 'tsconfig.json',
  'postcss.config.mjs': 'postcss.config.mjs',
  'eslint.config.mjs': 'eslint.config.mjs',
  '.gitignore': 'gitignore',
  'app/globals.css': 'app/globals.css',
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
  })
})
