import * as a from './dir/a.js'
import * as b from './dir/b.ts'

const requireTemplate = (key) => require(`./dir/${key}`)
const requireAdd = (key) => require('./dir/' + key)
const requireConcat = (key) => require('./dir/'.concat(key))
const importTemplate = (key) => import(`./dir/${key}`)
const importTemplateSuffix = (key) => import(`./dir/${key}.js`)
const importAdd = (key) => import('./dir/' + key)
const importAddSuffix = (key) => import('./dir/' + key + '.js')
const importConcat = (key) => import('./dir/'.concat(key))
const importConcatSuffix = (key) => import('./dir/'.concat(key, '.js'))

const requireSingleSuffix = (key) => require(`./dir/${key}.ts`)

it('should support dynamic requests in require with template literals', () => {
  expect(requireTemplate('a.js')).toBe(a)
  expect(requireTemplate('b.ts')).toBe(b)
  expect(requireTemplate('c.module.css')).toHaveProperty('class')
  expect(requireTemplate('d.js')).toBe('d')
})

it('should support dynamic requests in require with addition', () => {
  expect(requireAdd('a.js')).toBe(a)
  expect(requireAdd('b.ts')).toBe(b)
  expect(requireAdd('c.module.css')).toHaveProperty('class')
  expect(requireAdd('d.js')).toBe('d')
})

it('should support dynamic requests in require with concatenation', () => {
  expect(requireConcat('a.js')).toBe(a)
  expect(requireConcat('b.ts')).toBe(b)
  expect(requireConcat('c.module.css')).toHaveProperty('class')
  expect(requireConcat('d.js')).toBe('d')
})

it('should support dynamic requests in import with template literals', async () => {
  await expect(importTemplate('a.js')).resolves.toBe(a)
  await expect(importTemplate('b.ts')).resolves.toBe(b)
  await expect(importTemplate('c.module.css')).resolves.toHaveProperty('class')
  await expect(importTemplate('d.js')).resolves.toHaveProperty('default', 'd')
})

it('should support dynamic requests in import with template literals and suffix', async () => {
  await expect(importTemplateSuffix('a')).resolves.toBe(a)
  await expect(importTemplateSuffix('d')).resolves.toHaveProperty(
    'default',
    'd'
  )
})

it('should support dynamic requests in import with addition', async () => {
  await expect(importAdd('a.js')).resolves.toBe(a)
  await expect(importAdd('b.ts')).resolves.toBe(b)
  await expect(importAdd('c.module.css')).resolves.toHaveProperty('class')
  await expect(importAdd('d.js')).resolves.toHaveProperty('default', 'd')
})

it('should support dynamic requests in import with concatenation', async () => {
  await expect(importConcat('a.js')).resolves.toBe(a)
  await expect(importConcat('b.ts')).resolves.toBe(b)
  await expect(importConcat('c.module.css')).resolves.toHaveProperty('class')
  await expect(importConcat('d.js')).resolves.toHaveProperty('default', 'd')
})

it('should support dynamic requests in import with addition and suffix', async () => {
  await expect(importAddSuffix('a')).resolves.toBe(a)
  await expect(importAddSuffix('d')).resolves.toHaveProperty('default', 'd')
})

it('should support dynamic requests in import with concatenation and suffix', async () => {
  await expect(importConcatSuffix('a')).resolves.toBe(a)
  await expect(importConcatSuffix('d')).resolves.toHaveProperty('default', 'd')
})

it('should throw an error when requesting a non-existent file', async () => {
  expect(() => requireTemplate('e.js')).toThrowError()
  expect(() => requireAdd('e.js')).toThrowError()
  expect(() => requireConcat('e.js')).toThrowError()
  await expect(importTemplate('e.js')).rejects.toThrowError()
  await expect(importAdd('e.js')).rejects.toThrowError()
  await expect(importConcat('e.js')).rejects.toThrowError()
})

it('should support dynamic requests without the extension', async () => {
  expect(requireTemplate('a')).toBe(a)
  expect(requireAdd('a')).toBe(a)
  expect(requireConcat('a')).toBe(a)
  expect(requireTemplate('d')).toBe('d')
  expect(requireAdd('d')).toBe('d')
  expect(requireConcat('d')).toBe('d')
  await expect(importTemplate('a')).resolves.toBe(a)
  await expect(importTemplate('d')).resolves.toHaveProperty('default', 'd')
  await expect(importAdd('a')).resolves.toBe(a)
  await expect(importAdd('d')).resolves.toHaveProperty('default', 'd')
  await expect(importConcat('a')).resolves.toBe(a)
  await expect(importConcat('d')).resolves.toHaveProperty('default', 'd')
})

it('should not support dynamic requests with double extension', async () => {
  await expect(importTemplateSuffix('a.js')).rejects.toThrowError()
  await expect(importTemplateSuffix('d.js')).rejects.toThrowError()
  await expect(importAddSuffix('a.js')).rejects.toThrowError()
  await expect(importAddSuffix('d.js')).rejects.toThrowError()
  await expect(importConcatSuffix('a.js')).rejects.toThrowError()
  await expect(importConcatSuffix('d.js')).rejects.toThrowError()
})

it('should still interpolate even with a single match', async () => {
  expect(requireSingleSuffix('b')).toBe(b)
  expect(() => requireSingleSuffix('non-existent')).toThrowError()
})
