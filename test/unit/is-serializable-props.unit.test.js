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
Reason: \`undefined\` cannot be serialized as JSON. Please use \`null\` or omit this value."
`)

    expect(() =>
      isSerializableProps('/', 'test', { toplevel: Symbol('FOOBAR') })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.toplevel\` returned from \`test\` in \\"/\\".
Reason: \`symbol\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() => isSerializableProps('/', 'test', { toplevel: function () {} }))
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
Reason: \`undefined\` cannot be serialized as JSON. Please use \`null\` or omit this value."
`)

    expect(() =>
      isSerializableProps('/', 'test', { k: { n: Symbol('FOOBAR') } })
    ).toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k.n\` returned from \`test\` in \\"/\\".
Reason: \`symbol\` cannot be serialized as JSON. Please only return JSON serializable data types."
`)

    expect(() =>
      isSerializableProps('/', 'test', { k: { a: [function () {}] } })
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
Reason: Circular references cannot be expressed in JSON (references: \`(self)\`)."
`)

    expect(() => isSerializableProps('/', 'test', { k: [obj] }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[0].child\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`.k[0]\`)."
`)
  })

  it('can handle arr circular refs', () => {
    const arr = [{ foo: 'bar' }, true]
    arr.push(arr)

    expect(() => isSerializableProps('/', 'test', { arr }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.arr[2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`.arr\`)."
`)

    expect(() => isSerializableProps('/', 'test', { k: [{ arr }] }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[0].arr[2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`.k[0].arr\`)."
`)
  })

  it('can handle deep obj circular refs', () => {
    const obj = { foo: 'bar', test: true, leve1: { level2: {} } }
    obj.leve1.level2.child = obj

    expect(() => isSerializableProps('/', 'test', obj))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.leve1.level2.child\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`(self)\`)."
`)
  })

  it('can handle deep obj circular refs (with arrays)', () => {
    const obj = { foo: 'bar', test: true, leve1: { level2: {} } }
    obj.leve1.level2.child = [{ another: [obj] }]

    expect(() => isSerializableProps('/', 'test', obj))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.leve1.level2.child[0].another[0]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`(self)\`)."
`)
  })

  it('can handle deep arr circular refs', () => {
    const arr = [1, 2, []]
    arr[3] = [false, [null, 0, arr]]

    expect(() => isSerializableProps('/', 'test', { k: arr }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[3][1][2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`.k\`)."
`)
  })

  it('can handle deep arr circular refs (with objects)', () => {
    const arr = [1, 2, []]
    arr[3] = [false, { nested: [null, 0, arr] }]

    expect(() => isSerializableProps('/', 'test', { k: arr }))
      .toThrowErrorMatchingInlineSnapshot(`
"Error serializing \`.k[3][1].nested[2]\` returned from \`test\` in \\"/\\".
Reason: Circular references cannot be expressed in JSON (references: \`.k\`)."
`)
  })

  it('allows multi object refs', () => {
    const obj = { foo: 'bar', test: true }
    expect(
      isSerializableProps('/', 'test', {
        obj1: obj,
        obj2: obj,
      })
    ).toBe(true)
  })

  it('allows multi object refs nested', () => {
    const obj = { foo: 'bar', test: true }
    expect(
      isSerializableProps('/', 'test', {
        obj1: obj,
        obj2: obj,
        anArray: [obj],
        aKey: { obj },
      })
    ).toBe(true)
  })

  it('allows multi array refs', () => {
    const arr = [{ foo: 'bar' }, true]
    expect(
      isSerializableProps('/', 'test', {
        arr1: arr,
        arr2: arr,
      })
    ).toBe(true)
  })

  it('allows multi array refs nested', () => {
    const arr = [{ foo: 'bar' }, true]
    expect(
      isSerializableProps('/', 'test', {
        arr1: arr,
        arr2: arr,
        arr3: [arr],
        arr4: [1, [2, 3, arr]],
      })
    ).toBe(true)
  })

  it('allows identical object instances in an array', () => {
    const obj = { foo: 'bar' }
    const arr = [obj, obj]
    const objWithArr = { deep: { arr } }

    expect(isSerializableProps('/', 'test', { arr })).toBe(true)
    expect(isSerializableProps('/', 'test', { objWithArr })).toBe(true)
  })

  it('allows identical object instances in an array deeply', () => {
    const obj = { foo: 'bar' }
    const arr = [obj, [obj]]
    const objWithArr = { deep: { arr } }

    expect(isSerializableProps('/', 'test', { arr })).toBe(true)
    expect(isSerializableProps('/', 'test', { objWithArr })).toBe(true)
  })
})
