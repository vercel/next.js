import { nextTestSetup } from 'e2e-utils'

describe('twoslash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      twoslash: '0.3.4',
    },
  })

  it.each(['default', 'esnext'])(
    'should annotate twoslash types %s',
    async (mode) => {
      const { code, nodes, error } = JSON.parse(await next.render(`/?${mode}`))
      expect({ code, nodes, error }).toMatchInlineSnapshot(`
     {
       "code": "type X = Promise<number>;
     'hello'.toUpperCase()",
       "error": undefined,
       "nodes": [
         {
           "character": 5,
           "length": 1,
           "line": 0,
           "start": 5,
           "target": "X",
           "text": "type X = Promise<number>",
           "type": "hover",
         },
         {
           "character": 9,
           "docs": "Represents the completion of an asynchronous operation",
           "length": 7,
           "line": 0,
           "start": 9,
           "target": "Promise",
           "text": "interface Promise<T>",
           "type": "hover",
         },
         {
           "character": 8,
           "docs": "Converts all the alphabetic characters in a string to uppercase.",
           "length": 11,
           "line": 1,
           "start": 34,
           "target": "toUpperCase",
           "text": "(method) String.toUpperCase(): string",
           "type": "hover",
         },
       ],
     }
    `)
    }
  )
})
