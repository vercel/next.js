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
        choices: ['e2e', 'unit', 'production', 'development'],
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
        name: 'title',
        type: 'input',
        message: 'Title for the error',
      },
    ],
    actions: function (data) {
      const fileName = getFileName(data.title)
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
      ]
    },
  })
}
