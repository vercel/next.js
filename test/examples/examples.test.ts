import { createNextDescribe } from 'e2e-utils'
import path from 'path'
import fs from 'fs-extra'

const testedExamples = [
  // Internal features
  'active-class-name',
  'amp',
  'amp-first',
  'amp-story',
  'api-routes',
  'api-routes-cors',
  'api-routes-middleware',
  'api-routes-rate-limit',
  'api-routes-rest',
  'app-dir-i18n-routing',
  'app-dir-mdx',
  'basic-css',
  'basic-export',
  'blog',
  'blog-starter',
  'catch-all-routes',
  'custom-routes-proxying',
  'custom-server',
  'data-fetch',
  'dynamic-routing',
  'environment-variables',
  'fast-refresh-demo',
  'head-elements',
  'headers',
  'hello-world',
  'hello-world-esm',
  'i18n-routing',
  'image-component',
  'image-legacy-component',
  'layout-component',
  'middleware',
  'middleware-matcher',
  'modularize-imports',
  'nested-components',
  'next-css',
  'next-forms',
  'progressive-render',
  'redirects',
  'remove-console',
  'reproduction-template',
  'rewrites',
  'script-component',
  'ssr-caching',
  'styled-jsx-with-csp',
  'svg-components',
  'using-router',
  'with-absolute-imports',
  'with-app-layout',
  'with-context-api',
  'with-env-from-next-config-js',
  'with-loading',
  'with-shallow-routing',
  'with-sitemap',
  'with-typescript',
  'with-typescript-types',
  'with-web-worker',
  'with-webassembly',

  // Library integrations that we can't break
  'with-jest',
  'with-jest-babel',
  'with-mdx',
  'with-mdx-remote',
  'with-turbopack',
  'with-vercel-fetch',
]

describe.each(testedExamples)(`example '%s'`, (example) => {
  // If there is an issue during a build, jest won't tell us which example caused it
  // we need to log it ourselfs
  beforeAll(() => {
    require('console').log(`Running example '${example}'`)
  })

  const exampleFiles = path.join(__dirname, '..', '..', 'examples', example)
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
        ...packageJson.devDependencies,
      },
    },
    () => {
      it('builds', () => {})
    }
  )
})
