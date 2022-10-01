// @ts-check

/** @param {import("plop").NodePlopAPI} plop */
module.exports = function (plop) {
  function getFileName(str) {
    return str.toLowerCase().replace(/ /g, '-')
  }
  plop.setGenerator('test', {
    description: 'Create a new test',
    prompts: [
      {
        type: 'input',
        name: 'name',
        message: 'Test name',
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
    actions: function (data) {
      if (!data) return []
      const fileName = getFileName(data.name)
      return [
        {
          type: 'add',
          templateFile: `test/${
            data?.type === 'unit' ? 'unit' : 'e2e'
          }/example.txt`,
          path: `test/{{type}}/${
            data?.type === 'unit'
              ? `${fileName}.test.ts`
              : `${fileName}/index.test.ts`
          }`,
        },
      ]
    },
  })

  plop.setGenerator('error', {
    description: 'Create a new error document',
    prompts: [
      {
        name: 'urlPath',
        type: 'input',
        message: 'Url path with dashes. E.g. circular-structure',
      },
      {
        name: 'title',
        type: 'input',
        message: 'Title for the error. E.g. Circular Structure',
      },
      {
        name: 'why',
        type: 'input',
        message: 'What caused the error to happen?',
      },
      {
        name: 'fix',
        type: 'input',
        message: 'What are the possible ways to fix it?',
      },
    ],
    actions: function (data) {
      if (!data) return []
      const fileName = getFileName(data.urlPath)
      return [
        {
          type: 'add',
          path: `errors/${fileName}.md`,
          templateFile: `errors/template.txt`,
        },
        {
          type: 'modify',
          path: 'errors/manifest.json',
          transform(fileContents) {
            const manifestData = JSON.parse(fileContents)
            manifestData.routes[0].routes.push({
              title: fileName,
              path: `/errors/${fileName}.md`,
            })
            return JSON.stringify(manifestData, null, 2)
          },
        },
        `Url for the error: https://nextjs.org/docs/messages/${fileName}`,
      ]
    },
  })

  plop.setGenerator('lint', {
    description: 'Create a new lint rule',
    prompts: [
      {
        name: 'title',
        type: 'input',
        message: 'Title of the rule',
      },
      {
        name: 'description',
        type: 'input',
        message: 'Describe the rule in a single sentence',
      },
      {
        name: 'type',
        type: 'list',
        message: 'Should the linter warn or throw an error?',
        choices: ['error', 'warn'],
        default: 'error',
      },
    ],
    actions: function (data) {
      if (!data) return []
      const fileName = getFileName(data.urlPath)
      return [
        {
          type: 'add',
          path: `packages/eslint-plugin-next/lib/rules/${fileName}.ts`,
          templateFile: `packages/eslint-plugin-next/lib/template.txt`,
          data: { fileName },
        },
        {
          type: 'add',
          path: `test/unit/eslint-plugin-next/${fileName}.test.ts`,
          templateFile: `test/unit/eslint-plugin-next/template.txt`,
          data: { fileName },
        },
        {
          type: 'add',
          path: `errors/${fileName}.md`,
          templateFile: `errors/template.txt`,
        },
        // TODO:
        // {
        //   type: 'modify',
        //   path: 'packages/eslint-plugin-next/lib/index.js',
        //   transform(fileContents) {
        //     const rules = fs
        //       .readdirSync(
        //         path.join(__dirname, '/packages/eslint-plugin-next/lib/rules')
        //       )
        //       .map((file) => file.replace(/\.js$/, ''))
        //     return `module.exports = ${JSON.stringify(
        //       {
        //         rules: rules.reduce((acc, rule) => {
        //           acc[rule] = `require('./rules/${rule}'),`
        //           return acc
        //         }, {}),
        //         configs: {
        //           recommended: {
        //             plugins: ['@next/next'],
        //           },
        //         },
        //       },
        //       null,
        //       2
        //     )};`
        //   },
        // },
      ]
    },
  })
}
