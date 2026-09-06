import m from './module'

it('should allow any name as exports in CommonJs', () => {
  expect(m.abc).toBe('abc')
  expect(m['']).toBe('')
  expect(m['default']).toBe('default')
  expect(m['0']).toBe('0')
  expect(m[1]).toBe(1)
  expect(m.length).toBe('length')
  expect(m['0_0']).toBe('0_0')
  expect(m.if).toBe('if')
  expect(m['\0']).toBe('\0')
  expect(m['\n']).toBe('\n')
  expect(m['*/']).toBe('*/')
  expect(m['a.b.c']).toBe('a.b.c')
})
