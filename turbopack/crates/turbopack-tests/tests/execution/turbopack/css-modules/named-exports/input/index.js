import styles from './namespace.module.css'
import * as namespace from './namespace.module.css'
import {
  usedComposedClassName,
  'used-dashed-class-name' as usedDashedClassName,
} from './named.module.css'
import { moduleCode } from '../../../__helpers__/module-factories.js'
import { readCssChunks } from '../../../__helpers__/css.js'

// A generated class name, e.g. `abc123_base`.
const ownClassName = /^\w+_base$/

it('keeps the default export as the object of all class names', () => {
  expect(Object.keys(styles).sort()).toEqual(
    ['__esModule', 'base', 'composed', 'default', 'foo-bar'].sort()
  )
  expect(styles.base).toMatch(ownClassName)
  expect(styles.composed.split(' ')).toEqual([
    expect.stringMatching(/_composed$/),
    styles.base,
  ])
  expect(styles['foo-bar']).toMatch(/_foo-bar$/)
  // A `default` class doesn't replace the default export.
  expect(styles.default).toMatch(/_default$/)
  expect(styles.__esModule).toMatch(/__esModule$/)
})

it('exports every class name as a named export, except `default` and `__esModule`', () => {
  expect(namespace.default).toBe(styles)
  expect(namespace.base).toBe(styles.base)
  expect(namespace.composed).toBe(styles.composed)
  expect(namespace['foo-bar']).toBe(styles['foo-bar'])
  expect(Object.keys(namespace).sort()).toEqual(
    ['base', 'composed', 'default', 'foo-bar'].sort()
  )
  // Like the namespace of a module exporting a single value, the class names come before
  // `default`.
  expect(Object.keys(namespace).at(-1)).toBe('default')
})

it('returns the namespace from require()', () => {
  const required = require('./namespace.module.css')
  expect(required.default).toBe(styles)
  expect(required.base).toBe(styles.base)
  expect(required['foo-bar']).toBe(styles['foo-bar'])
})

it('supports named imports, including string names and composed classes', () => {
  expect(usedComposedClassName.split(' ')).toEqual([
    expect.stringMatching(/_usedComposedClassName$/),
    expect.stringMatching(/_usedBaseClassName$/),
  ])
  expect(usedDashedClassName).toMatch(/_used-dashed-class-name$/)
})

it('only emits used exports, under mangled keys', () => {
  const code = moduleCode('named.module.css')
  // The class names themselves are still part of the composed value.
  expect(code).toContain('_usedBaseClassName')
  // But only the used exports are emitted, and their keys are shortened.
  expect(code).not.toContain('unusedClassName')
  for (const name of [
    'usedBaseClassName',
    'usedComposedClassName',
    'used-dashed-class-name',
  ]) {
    expect(code).not.toContain(`"${name}"`)
  }
})

it('keeps the CSS rules of classes whose exports are unused', () => {
  const css = readCssChunks(import.meta.url).join('\n')
  expect(css).toMatch(/\.\w+_unusedClassName \{/)
})
