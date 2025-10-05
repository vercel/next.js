/* eslint-env jest */
import { transformSync } from '@babel/core'

const babel = (code) =>
  transformSync(code, {
    filename: 'page.tsx',
    presets: ['@babel/preset-typescript'],
    plugins: [require('next/dist/build/babel/plugins/next-page-config')],
    babelrc: false,
    configFile: false,
    sourceType: 'module',
    compact: true,
    caller: {
      name: 'tests',
      isDev: false,
    },
  } as any).code

describe('babel plugin (next-page-config)', () => {
  test('export config with type annotation', () => {
    const output = babel('export const config: PageConfig = {};')

    expect(output).toMatch(`export const config={};`)
  })

  test('export config with AsExpression', () => {
    const output = babel('export const config = {} as PageConfig;')

    expect(output).toMatch('export const config={};')
  })
})
