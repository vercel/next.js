/* eslint-env jest */
import { isSerializableProps } from 'next/dist/lib/is-serializable-props'

describe('isSerializableProps', () => {
  it('handles null and undefined props', () => {
    expect(() => isSerializableProps('/', 'test', null))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing props returned from \`test\` in \\"/\\".
Reason: Props must be returned as a plain object from test: \`{ props: { ... } }\`."
`)

    expect(() => isSerializableProps('/', 'test', undefined))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing props returned from \`test\` in \\"/\\".
Reason: Props must be returned as a plain object from test: \`{ props: { ... } }\`."
`)
  })

  it('allows empty props', () => {
    expect(isSerializableProps('/', 'test', {})).toBe(true)
  })

  it('allows all different types of props', () => {
    expect(
      isSerializableProps('/', 'test', {
        str: 'foobar',
        bool: true,
        bool2: false,
        num: 0,
        numn1: -1,
        num5: 5,
        noop: null,
        arr: [
          'f',
          true,
          false,
          -5,
          -1,
          0,
          1,
          5,
          null,
          {},
          {
            str: 'foobar',
            bool: true,
            bool2: false,
            num: 0,
            numn1: -1,
            num5: 5,
            noop: null,
          },
        ],
        obj1: {
          str: 'foobar',
          bool: true,
          bool2: false,
          num: 0,
          numn1: -1,
          num5: 5,
          noop: null,
          arr: [
            'f',
            true,
            false,
            -5,
            -1,
            0,
            1,
            5,
            null,
            {},
            {
              str: 'foobar',
              bool: true,
              bool2: false,
              num: 0,
              numn1: -1,
              num5: 5,
              noop: null,
            },
          ],
        },
      })
    ).toBe(true)
  })

  it('disallows top-level non-serializable types', () => {
    expect(() => isSerializableProps('/', 'test', { toplevel: new Date() }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`object\` (\\"[object Date]\\") cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() => isSerializableProps('/', 'test', { toplevel: class A {} }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`function\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() => isSerializableProps('/', 'test', { toplevel: undefined }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`undefined\` cannot be serialized as JSON. Please use \`null\` or omit this value all together."
`)

    expect(() =>
      isSerializableProps('/', 'test', { toplevel: Symbol('FOOBAR') })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`symbol\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() => isSerializableProps('/', 'test', { toplevel: function() {} }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`function\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)
  })

  it('diallows nested non-serializable types', () => {
    expect(() =>
      isSerializableProps('/', 'test', { k: { a: [1, { n: new Date() }] } })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.a[1].n\` returned from \`test\` in \\"/\\".
Reason: \`object\` (\\"[object Date]\\") cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() =>
      isSerializableProps('/', 'test', { k: { a: [1, { n: class A {} }] } })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.a[1].n\` returned from \`test\` in \\"/\\".
Reason: \`function\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() => isSerializableProps('/', 'test', { k: { a: [1, undefined] } }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.a[1]\` returned from \`test\` in \\"/\\".
Reason: \`undefined\` cannot be serialized as JSON. Please use \`null\` or omit this value all together."
`)

    expect(() =>
      isSerializableProps('/', 'test', { k: { n: Symbol('FOOBAR') } })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.n\` returned from \`test\` in \\"/\\".
Reason: \`symbol\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() =>
      isSerializableProps('/', 'test', { k: { a: [function() {}] } })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.a[0]\` returned from \`test\` in \\"/\\".
Reason: \`function\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)
  })

  it('can handle obj circular refs', () => {
    const obj = { foo: 'bar', test: true }
    obj.child = obj

    expect(() => isSerializableProps('/', 'test', obj))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.child\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON."
`)

    expect(() => isSerializableProps('/', 'test', { k: [obj] }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[0].child\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON."
`)
  })

  it('can handle arr circular refs', () => {
    const arr = [{ foo: 'bar' }, true]
    arr.push(arr)

    expect(() => isSerializableProps('/', 'test', { arr }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.arr[2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON."
`)

    expect(() => isSerializableProps('/', 'test', { k: [{ arr }] }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[0].arr[2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON."
`)
  })
})
