import { createNextDescribe } from 'e2e-utils'
import path from 'path'
import fs from 'fs-extra'

export const testExample = (example) => {
  const exampleFiles = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'examples',
    example
  )

  const packageJson = fs.readJsonSync(path.join(exampleFiles, 'package.json'))
  describe(`example '${example}'`, () => {
    // If there is an issue during a build, jest won't tell us which example caused it
    // we need to log it ourselfs
    beforeAll(() => {
      require('console').log(`Running example '${example}'`)
    })
    createNextDescribe(
      `example '${example}'`,
      {
        files: exampleFiles,
        dependencies: {
          // We need to make sure that these default dependencies are not installed by default
          // for our examples to ensure that they have all their dependencies in package.json
          '@types/node': undefined,
          '@types/react': undefined,
          next: undefined,
          react: undefined,
          'react-dom': undefined,
          typescript: undefined,
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        },
      },
      () => {
        it('builds', () => {})
      }
    )
  })
}
