import { createNextDescribe } from 'e2e-utils'
import path from 'path'
import fs from 'fs-extra'

const testedExamples = [
  'active-class-name',
  'amp',
  'amp-first',
  'amp-story',
  'api-routes',
  'api-routes-cors',
  'api-routes-middleware',
]

testedExamples.forEach((example) => {
  const exampleFiles = path.join(
    __dirname,
    '..',
    '..',
    '..',
    'examples',
    example
  )

  const packageJson = fs.readJsonSync(path.join(exampleFiles, 'package.json'))

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
      },
    },
    () => {
      it('builds', () => {})
    }
  )
})
