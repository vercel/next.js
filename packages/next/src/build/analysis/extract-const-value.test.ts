import { extractExportedConstValue } from './extract-const-value'
import type { Module } from '@swc/core'

/**
 * Helper to create a minimal SWC Module AST from source code.
 * Uses a simplified representation matching SWC's output structure.
 */
function createModule(body: any[]): Module {
  return {
    type: 'Module',
    span: { start: 0, end: 0, ctxt: 0 },
    body,
    interpreter: null,
  } as Module
}

function stringLiteral(value: string) {
  return { type: 'StringLiteral', span: { start: 0, end: 0, ctxt: 0 }, value, hasEscape: false }
}

function numericLiteral(value: number) {
  return { type: 'NumericLiteral', span: { start: 0, end: 0, ctxt: 0 }, value }
}

function identifier(value: string) {
  return { type: 'Identifier', span: { start: 0, end: 0, ctxt: 0 }, value, optional: false }
}

function arrayExpression(elements: any[]) {
  return {
    type: 'ArrayExpression',
    span: { start: 0, end: 0, ctxt: 0 },
    elements: elements.map((e) => (e ? { spread: undefined, expression: e } : null)),
  }
}

function templateLiteral(quasis: string[], expressions: any[]) {
  return {
    type: 'TemplateLiteral',
    span: { start: 0, end: 0, ctxt: 0 },
    expressions,
    quasis: quasis.map((q) => ({
      span: { start: 0, end: 0, ctxt: 0 },
      cooked: q,
      raw: q,
    })),
  }
}

function callExpression(object: any, method: string, args: any[]) {
  return {
    type: 'CallExpression',
    span: { start: 0, end: 0, ctxt: 0 },
    callee: {
      type: 'MemberExpression',
      span: { start: 0, end: 0, ctxt: 0 },
      object,
      property: identifier(method),
    },
    arguments: args.map((a) => ({ spread: undefined, expression: a })),
    typeArguments: undefined,
  }
}

function constDeclaration(name: string, init: any, exported = false) {
  const varDecl = {
    type: 'VariableDeclaration',
    span: { start: 0, end: 0, ctxt: 0 },
    kind: 'const' as const,
    declare: false,
    declarations: [
      {
        type: 'VariableDeclarator',
        span: { start: 0, end: 0, ctxt: 0 },
        id: identifier(name),
        init,
        definite: false,
      },
    ],
  }

  if (exported) {
    return {
      type: 'ExportDeclaration',
      span: { start: 0, end: 0, ctxt: 0 },
      declaration: varDecl,
    }
  }

  return varDecl
}

function objectExpression(properties: Record<string, any>) {
  return {
    type: 'ObjectExpression',
    span: { start: 0, end: 0, ctxt: 0 },
    properties: Object.entries(properties).map(([key, value]) => ({
      type: 'KeyValueProperty',
      key: identifier(key),
      value,
    })),
  }
}

function tsAsConst(expression: any) {
  return {
    type: 'TsConstAssertion',
    span: { start: 0, end: 0, ctxt: 0 },
    expression,
  }
}

describe('extractExportedConstValue', () => {
  describe('template literals with expressions', () => {
    it('evaluates a template literal with a string expression', () => {
      // export const config = { matcher: `/${'api'}` }
      const module = createModule([
        constDeclaration(
          'config',
          objectExpression({
            matcher: templateLiteral(['/', ''], [stringLiteral('api')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api' } })
    })

    it('evaluates a template literal with multiple expressions', () => {
      // export const config = { matcher: `/${prefix}/${suffix}` }
      const module = createModule([
        constDeclaration('prefix', stringLiteral('api')),
        constDeclaration('suffix', stringLiteral('users')),
        constDeclaration(
          'config',
          objectExpression({
            matcher: templateLiteral(['/', '/', ''], [identifier('prefix'), identifier('suffix')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api/users' } })
    })

    it('evaluates a template literal with no expressions', () => {
      // export const config = { matcher: `/api` }
      const module = createModule([
        constDeclaration(
          'config',
          objectExpression({
            matcher: templateLiteral(['/api'], []),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api' } })
    })
  })

  describe('identifier resolution', () => {
    it('resolves a const identifier from module scope', () => {
      // const basePath = '/api'
      // export const config = { matcher: basePath }
      const module = createModule([
        constDeclaration('basePath', stringLiteral('/api')),
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('basePath') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api' } })
    })

    it('resolves an exported const identifier', () => {
      // export const basePath = '/api'
      // export const config = { matcher: basePath }
      const module = createModule([
        constDeclaration('basePath', stringLiteral('/api'), true),
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('basePath') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api' } })
    })

    it('resolves an array identifier', () => {
      // const paths = ['/foo', '/bar']
      // export const config = { matcher: paths }
      const module = createModule([
        constDeclaration(
          'paths',
          arrayExpression([stringLiteral('/foo'), stringLiteral('/bar')])
        ),
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('paths') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: ['/foo', '/bar'] } })
    })

    it('detects circular references', () => {
      // const a = b; const b = a;
      // export const config = { matcher: a }
      const module = createModule([
        constDeclaration('a', identifier('b')),
        constDeclaration('b', identifier('a')),
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('a') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toHaveProperty('unsupported')
      expect((result as any).unsupported).toContain('Circular reference')
    })

    it('returns unsupported for unknown identifiers', () => {
      // export const config = { matcher: unknownVar }
      const module = createModule([
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('unknownVar') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toHaveProperty('unsupported')
      expect((result as any).unsupported).toContain('Unknown identifier')
    })
  })

  describe('method calls', () => {
    it('evaluates Array.join()', () => {
      // const locales = ['en', 'de']
      // export const config = { matcher: locales.join('|') }
      const module = createModule([
        constDeclaration(
          'locales',
          arrayExpression([stringLiteral('en'), stringLiteral('de')])
        ),
        constDeclaration(
          'config',
          objectExpression({
            matcher: callExpression(identifier('locales'), 'join', [
              stringLiteral('|'),
            ]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: 'en|de' } })
    })

    it('evaluates Array.join() with no separator', () => {
      // const arr = ['a', 'b']
      // export const config = { value: arr.join() }
      const module = createModule([
        constDeclaration(
          'arr',
          arrayExpression([stringLiteral('a'), stringLiteral('b')])
        ),
        constDeclaration(
          'config',
          objectExpression({
            value: callExpression(identifier('arr'), 'join', []),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { value: 'a,b' } })
    })

    it('returns unsupported for unknown methods', () => {
      const module = createModule([
        constDeclaration(
          'arr',
          arrayExpression([stringLiteral('a')])
        ),
        constDeclaration(
          'config',
          objectExpression({
            value: callExpression(identifier('arr'), 'map', []),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toHaveProperty('unsupported')
      expect((result as any).unsupported).toContain('.map()')
    })
  })

  describe('edge cases', () => {
    it('evaluates numeric expressions in template literals', () => {
      // const version = 2
      // export const config = { matcher: `/api/v${version}` }
      const module = createModule([
        constDeclaration('version', numericLiteral(2)),
        constDeclaration(
          'config',
          objectExpression({
            matcher: templateLiteral(['/api/v', ''], [identifier('version')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api/v2' } })
    })

    it('evaluates Array.join() on an empty array', () => {
      const module = createModule([
        constDeclaration('empty', arrayExpression([])),
        constDeclaration(
          'config',
          objectExpression({
            value: callExpression(identifier('empty'), 'join', [stringLiteral('|')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { value: '' } })
    })

    it('resolves identifiers through multiple levels', () => {
      // const a = b; const b = '/path'
      // export const config = { matcher: a }
      const module = createModule([
        constDeclaration('a', identifier('b')),
        constDeclaration('b', stringLiteral('/path')),
        constDeclaration(
          'config',
          objectExpression({ matcher: identifier('a') }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/path' } })
    })

    it('evaluates Array.join() with numeric array values', () => {
      const module = createModule([
        constDeclaration(
          'nums',
          arrayExpression([numericLiteral(1), numericLiteral(2), numericLiteral(3)])
        ),
        constDeclaration(
          'config',
          objectExpression({
            value: callExpression(identifier('nums'), 'join', [stringLiteral('|')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { value: '1|2|3' } })
    })

    it('handles mixed identifier and literal in template literal', () => {
      // const prefix = 'api'
      // export const config = { matcher: `/${prefix}-v1/:path*` }
      const module = createModule([
        constDeclaration('prefix', stringLiteral('api')),
        constDeclaration(
          'config',
          objectExpression({
            matcher: templateLiteral(['/', '-v1/:path*'], [identifier('prefix')]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({ value: { matcher: '/api-v1/:path*' } })
    })
  })

  describe('i18n middleware matcher pattern', () => {
    it('evaluates the common i18n locale pattern', () => {
      // const locales = ['en', 'de', 'fr'] as const
      // export const config = {
      //   matcher: ['/', `/(${locales.join('|')})/:path*`]
      // }
      const localesArray = arrayExpression([
        stringLiteral('en'),
        stringLiteral('de'),
        stringLiteral('fr'),
      ])

      const module = createModule([
        constDeclaration('locales', tsAsConst(localesArray)),
        constDeclaration(
          'config',
          objectExpression({
            matcher: arrayExpression([
              stringLiteral('/'),
              templateLiteral(
                ['/(', ')/:path*'],
                [callExpression(identifier('locales'), 'join', [stringLiteral('|')])]
              ),
            ]),
          }),
          true
        ),
      ])

      const result = extractExportedConstValue(module, 'config')
      expect(result).toEqual({
        value: {
          matcher: ['/', '/(en|de|fr)/:path*'],
        },
      })
    })
  })
})
