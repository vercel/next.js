import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs-extra'

// Every directory in starters/ is tested; there is no allowlist to forget.
const startersDir = path.join(__dirname, '..', '..', 'starters')
const starters = fs
  .readdirSync(startersDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

describe.each(starters)(`starter '%s'`, (starter) => {
  // If there is an issue during a build, jest won't tell us which starter
  // caused it, so we log it ourselves
  beforeAll(() => {
    require('console').log(`Running starter '${starter}'`)
  })

  const starterFiles = path.join(startersDir, starter)
  const packageJson = fs.readJsonSync(path.join(starterFiles, 'package.json'))
  describe(`starter '${starter}'`, () => {
    nextTestSetup({
      files: starterFiles,
      dependencies: {
        // We need to make sure that these default dependencies are not
        // installed by default for our starters to ensure that they have all
        // their dependencies in package.json
        '@types/node': undefined,
        '@types/react': undefined,
        next: undefined,
        react: undefined,
        'react-dom': undefined,
        typescript: undefined,
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      },
    })
    it('builds', () => {})
  })
})
