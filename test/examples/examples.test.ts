import { nextTestSetup } from 'e2e-utils'
import path from 'path'
import fs from 'fs-extra'

const testedExamples = [
  // Internal features
  'active-class-name',
  'api-routes-cors',
  'api-routes-middleware',
  'api-routes-rest',
  'basic-css',
  'blog',
  'blog-starter',
  'custom-server',
  'hello-world',
  'i18n-routing',
  'i18n-routing-pages',
  'image-component',
  'mdx',
  'next-forms',
  'remove-console',
  'reproduction-template',
  'with-absolute-imports',
  'with-context-api',
  'with-shallow-routing',
  'with-sitemap',
  'with-typescript',
  'with-typescript-types',
  'with-web-worker',
  'with-webassembly',

  // Library integrations that we can't break
  'mdx-pages',
  'mdx-remote',
  'with-jest',
  'with-jest-babel',
  'with-turbopack',
]

describe.each(testedExamples)(`example '%s'`, (example) => {
  // If there is an issue during a build, jest won't tell us which example caused it
  // we need to log it ourselfs
  beforeAll(() => {
    require('console').log(`Running example '${example}'`)
  })

  const exampleFiles = path.join(__dirname, '..', '..', 'examples', example)
  const packageJson = fs.readJsonSync(path.join(exampleFiles, 'package.json'))
  describe(`example '${example}'`, () => {
    nextTestSetup({
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
    })
    it('builds', () => {})
  })
})
