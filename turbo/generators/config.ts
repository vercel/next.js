import { type NodePlopAPI } from 'node-plop'
import path from 'path'
import * as helpers from './helpers'

interface TestResponse {
  appDir: string
  type: 'e2e' | 'production' | 'development' | 'unit'
}

interface ErrorResponse {
  name: string
  title: string
  why: string
  fix: string
}

function validateNonEmptyString(field: string) {
  return function (value: string) {
    if (/.+/.test(value)) {
      return true
    }
    return `${field} is required`
  }
}

export default function generator(plop: NodePlopAPI): void {
  // make our custom helpers available for use in templates as handlebars helpers
  helpers.init(plop)

  plop.setGenerator('test', {
    description: 'Create a new test',
    prompts: [
      {
        type: 'confirm',
        name: 'appDir',
        message: 'Is this test for the app directory?',
        default: true,
      },
      {
        type: 'input',
        name: 'name',
        message: 'Test name',
        validate: validateNonEmptyString('test name'),
      },
      {
        type: 'list',
        name: 'type',
        message: 'Test type',
        choices: [
          {
            name: 'e2e - Test "next dev" and "next build && next start"',
            value: 'e2e',
          },
          {
            name: 'production - Test "next build && next start"',
            value: 'production',
          },
          { name: 'development - Test "next dev"', value: 'development' },
          { name: 'unit - Test individual files', value: 'unit' },
        ],
      },
    ],
    actions: function (answers) {
      const { appDir, type } = answers as TestResponse
      const testRoot = path.join(plop.getDestBasePath(), 'test')

      const appDirPath = appDir ? 'app-dir/' : ''
      let templatePath = path.join(
        testRoot,
        type === 'unit' ? 'unit' : 'e2e',
        appDirPath,
        'test-template'
      )
      let targetPath = path.join(testRoot, type, appDirPath)

      return [
        {
          type: 'addMany',
          templateFiles: `${templatePath}/**/*`,
          base: templatePath,
          destination: targetPath,
        },
      ]
    },
  })

  plop.setGenerator('error', {
    description: 'Create a new error document',
    prompts: [
      {
        name: 'name',
        type: 'input',
        message: 'Url path with dashes. E.g. circular-structure',
        validate: validateNonEmptyString('path'),
      },
      {
        name: 'title',
        type: 'input',
        message: 'Title for the error. E.g. Circular Structure',
        validate: validateNonEmptyString('title'),
      },
      {
        name: 'why',
        type: 'input',
        message: 'What caused the error to happen?',
        validate: validateNonEmptyString('why'),
      },
      {
        name: 'fix',
        type: 'input',
        message: 'What are the possible ways to fix it?',
        validate: validateNonEmptyString('fix'),
      },
    ],
    actions: function (answers) {
      const { name } = answers as ErrorResponse
      const errorsRoot = path.join(plop.getDestBasePath(), 'errors')

      return [
        {
          type: 'add',
          path: path.join(errorsRoot, `{{ toFileName name }}.mdx`),
          templateFile: path.join(errorsRoot, `template.txt`),
        },
        `Url for the error: https://nextjs.org/docs/messages/${helpers.toFileName(
          name
        )}`,
      ]
    },
  })
}
