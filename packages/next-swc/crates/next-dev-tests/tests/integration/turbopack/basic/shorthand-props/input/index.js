import def, { named } from './module.js'
import {
  nested,
  nested2,
  nested_with_identity,
  nested_with_identity2,
  double_nested,
  double_nested2,
  double_nested_with_identity,
  double_nested_with_identity2,
} from './reexport.js'

it('support imports in shorthand properties', () => {
  expect(def).toBe('default')
  expect(named).toBe('named')
  expect({ def }).toStrictEqual({ def: 'default' })
  expect({ named }).toStrictEqual({ named: 'named' })
  expect(nested).toStrictEqual({ def: 'default', named: 'named' })
  expect(nested2).toStrictEqual({ def: 'default', named: 'named' })
  expect(nested_with_identity).toStrictEqual({
    def: 'default',
    named: 'named',
  })
  expect(nested_with_identity2).toStrictEqual({
    def: 'default',
    named: 'named',
  })
  expect(double_nested).toStrictEqual({
    nested: {
      def: 'default',
      named: 'named',
    },
  })
  expect(double_nested2).toStrictEqual({
    nested: {
      def: 'default',
      named: 'named',
    },
  })
  expect(double_nested_with_identity).toStrictEqual({
    nested: {
      def: 'default',
      named: 'named',
    },
  })
  expect(double_nested_with_identity2).toStrictEqual({
    nested: {
      def: 'default',
      named: 'named',
    },
  })
})
