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
      const fileName = getFileName(data.name)
      return [
        {
          type: 'add',
          templateFile: `test/${
            data.type === 'unit' ? 'unit' : 'e2e'
          }/example.txt`,
          path: `test/{{type}}/${
            data.type === 'unit'
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
          transform(fileContents, data) {
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
}
