/* eslint-env jest */
import { transform, transformSync } from 'next/dist/build/swc'
import Visitor from '@swc/core/Visitor'

const swc = async (code, options = {}) => {
  let output = await transform(code, options)
  return output.code
}

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

/**
 * @see https://swc.rs/docs/usage-plugin/
 */
class ConsoleStripper extends Visitor {
  visitCallExpression(e) {
    if (e.callee.type !== 'MemberExpression') {
      return e
    }

    if (
      e.callee.object.type === 'Identifier' &&
      e.callee.object.value === 'console'
    ) {
      if (e.callee.property.type === 'Identifier') {
        return {
          type: 'UnaryExpression',
          span: e.span,
          operator: 'void',
          argument: {
            type: 'NumericLiteral',
            span: e.span,
            value: 0,
          },
        }
      }
    }

    return e
  }
}

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
        "import { useState } from 'react';
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
        "import { useState } from 'react';
        var ref = useState(0), setCount = ref[1];
        "
      `)
    })
  })

  describe('plugin system', () => {
    describe('with sync transform', () => {
      it('should handle the plugin option', async () => {
        const output = transformSync(
          trim`
          if (foo) {
            console.log("Foo");
          } else {
            console.log("Bar");
          }
          `,
          {
            plugin: (m) => new ConsoleStripper().visitProgram(m),
          }
        )

        expect(output.code).toMatchInlineSnapshot(`
          "if (foo) {
              void 0;
          } else {
              void 0;
          }
          "
        `)
      })

      it('should handle the plugins option', async () => {
        const output = transformSync(
          trim`
          if (foo) {
            console.log("Foo");
          } else {
            console.log("Bar");
          }
          `,
          {
            plugins: [(m) => new ConsoleStripper().visitProgram(m)],
          }
        )

        expect(output.code).toMatchInlineSnapshot(`
          "if (foo) {
              void 0;
          } else {
              void 0;
          }
          "
        `)
      })
    })

    describe('with async transform', () => {
      it('should handle the plugin option', async () => {
        const output = await swc(
          trim`
          if (foo) {
            console.log("Foo");
          } else {
            console.log("Bar");
          }
          `,
          {
            plugin: (m) => new ConsoleStripper().visitProgram(m),
          }
        )

        expect(output).toMatchInlineSnapshot(`
          "if (foo) {
              void 0;
          } else {
              void 0;
          }
          "
        `)
      })

      it('should handle the plugins option', async () => {
        const output = await swc(
          trim`
          if (foo) {
            console.log("Foo");
          } else {
            console.log("Bar");
          }
          `,
          {
            plugins: [(m) => new ConsoleStripper().visitProgram(m)],
          }
        )

        expect(output).toMatchInlineSnapshot(`
          "if (foo) {
              void 0;
          } else {
              void 0;
          }
          "
        `)
      })
    })
  })
})
