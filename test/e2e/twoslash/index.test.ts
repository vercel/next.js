import { nextTestSetup } from 'e2e-utils'

describe('twoslash', () => {
  const { next } = nextTestSetup({
    files: __dirname,
    dependencies: {
      twoslash: '0.3.4',
    },
  })

  it('should annotate twoslash types', async () => {
    const { code, nodes } = JSON.parse(await next.render('/'))

    expect({ code, nodes }).toMatchInlineSnapshot(`
     {
       "code": "'hello'.toUpperCase()",
       "nodes": [
         {
           "character": 8,
           "docs": "Converts all the alphabetic characters in a string to uppercase.",
           "length": 11,
           "line": 0,
           "start": 8,
           "target": "toUpperCase",
           "text": "(method) String.toUpperCase(): string",
           "type": "hover",
         },
       ],
     }
    `)
  })
})
