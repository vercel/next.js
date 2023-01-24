module.exports = function (plop) {
  const toFileName = (str) => str.toLowerCase().replace(/ /g, '-')
  plop.setHelper('toFileName', toFileName)

  plop.setGenerator('test', {
    description: 'Create a new test',
    prompts: [
      {
        type: 'confirm',
        name: 'appDir',
        message: 'Is this test for the app directory?',
        default: false,
      },
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
      const appDirPath = data.appDir ? 'app-dir/' : ''
      let templatePath = `test/${
        data.type === 'unit' ? 'unit' : 'e2e'
      }/${appDirPath}test-template`
      let targetPath = `test/{{ type }}/${appDirPath}`

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
    actions: function ({ name }) {
      return [
        {
          type: 'add',
          path: `errors/{{ toFileName name }}.md`,
          templateFile: `errors/template.txt`,
        },
        {
          type: 'modify',
          path: 'errors/manifest.json',
          transform(fileContents) {
            const manifestData = JSON.parse(fileContents)
            manifestData.routes[0].routes.push({
              title: toFileName(name),
              path: `/errors/${toFileName(name)}.md`,
            })
            return JSON.stringify(manifestData, null, 2)
          },
        },
        `Url for the error: https://nextjs.org/docs/messages/${toFileName(
          name
        )}`,
      ]
    },
  })
}
