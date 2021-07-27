/* eslint-env jest */
import { transform } from '@babel/core'

const trim = (s) => s.join('\n').trim().replace(/^\s+/gm, '')

const mockOnWarning = jest.fn()

// avoid generating __source annotations in JSX during testing:
const plugin = require('next/dist/build/babel/plugins/no-anonymous-default-export')

const babel = (code, esm = true, pluginOptions = {}) =>
  transform(code, {
    filename: 'noop.js',
    presets: [['@babel/preset-react', { development: true, pragma: '__jsx' }]],
    plugins: [[plugin, pluginOptions]],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: true,
    caller: {
      name: 'tests',
      supportsStaticESM: esm,
      onWarning: mockOnWarning,
    },
  }).code

describe('babel plugin (no-anonymous-default-export)', () => {
  beforeEach(() => {
    mockOnWarning.mockReset()
  })

  describe('ArrowFunctionExpression', () => {
    it('should trigger on a default export anonymous arrow function', () => {
      babel(trim`
        export default () => 'hello'
      `)
      expect(mockOnWarning).toHaveBeenCalled()
    })

    it('should not trigger on a named default export arrow function', () => {
      babel(trim`
        const func = () => 'hello'
        export default func
      `)
      expect(mockOnWarning).not.toHaveBeenCalled()
    })
  })

  describe('FunctionDeclaration', () => {
    it('should trigger on a default export anonymous function', () => {
      babel(trim`
        export default function() { return 'hello' }
      `)
      expect(mockOnWarning).toHaveBeenCalled()
    })

    it('should not trigger on a named default export function', () => {
      babel(trim`
        function named() { return 'hello' }
        export default named
      `)
      expect(mockOnWarning).not.toHaveBeenCalled()
    })
  })
})
