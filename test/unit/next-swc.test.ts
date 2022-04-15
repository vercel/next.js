/* eslint-env jest */
import { transform } from 'next/dist/build/swc'

const swc = async (code) => {
  let output = await transform(code)
  return output.code
}

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

describe('next/swc', () => {
  describe('hook_optimizer', () => {
    it('should transform Array-destructured hook return values use object destructuring', async () => {
      const output = await swc(
        trim`
        import { useState } from 'react';
        const [count, setCount] = useState(0);
      `
      )

      expect(output).toMatch(trim`
        var ref = useState(0), count = ref[0], setCount = ref[1];
      `)

      expect(output).toMatchInlineSnapshot(`
"import { useState } from \\"react\\";
var ref = useState(0), count = ref[0], setCount = ref[1];
"
`)
    })

    it('should be able to ignore some Array-destructured hook return values', async () => {
      const output = await swc(
        trim`
        import { useState } from 'react';
        const [, setCount] = useState(0);
      `
      )

      expect(output).toMatch(trim`
        var ref = useState(0), setCount = ref[1];
      `)

      expect(output).toMatchInlineSnapshot(`
"import { useState } from \\"react\\";
var ref = useState(0), setCount = ref[1];
"
`)
    })
  })
})
