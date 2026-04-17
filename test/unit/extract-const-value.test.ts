import { extractExportedConstValue } from 'next/dist/build/analysis/extract-const-value'
import { parseModule } from 'next/dist/build/analysis/parse-module'
import { installBindings } from 'next/dist/build/swc/install-bindings'

async function extractFor(source: string, exportedName: string) {
  const mod = await parseModule('virtual.ts', source)
  return extractExportedConstValue(mod, exportedName)
}

describe('extractExportedConstValue', () => {
  beforeAll(async () => {
    await installBindings()
  })

  it('extracts plain numeric literals', async () => {
    const result = await extractFor(
      `export const revalidate = 60`,
      'revalidate'
    )
    expect(result).toEqual({ value: 60 })
  })

  it('folds multiplicative BinaryExpression (regression for #72365)', async () => {
    const result = await extractFor(
      `export const revalidate = 60 * 5`,
      'revalidate'
    )
    expect(result).toEqual({ value: 300 })
  })

  it('folds additive BinaryExpression', async () => {
    const result = await extractFor(
      `export const revalidate = 60 + 30`,
      'revalidate'
    )
    expect(result).toEqual({ value: 90 })
  })

  it('folds nested BinaryExpression', async () => {
    const result = await extractFor(
      `export const revalidate = 60 * 60 * 24`,
      'revalidate'
    )
    expect(result).toEqual({ value: 86400 })
  })

  it('folds string concatenation', async () => {
    const result = await extractFor(
      `export const runtime = 'edge' + ''`,
      'runtime'
    )
    expect(result).toEqual({ value: 'edge' })
  })

  it('folds unary minus on a numeric literal', async () => {
    const result = await extractFor(`export const x = -42`, 'x')
    expect(result).toEqual({ value: -42 })
  })

  it('folds unary minus inside a BinaryExpression', async () => {
    const result = await extractFor(`export const x = 100 + -42`, 'x')
    expect(result).toEqual({ value: 58 })
  })

  it('folds the exponentiation operator', async () => {
    const result = await extractFor(`export const x = 2 ** 10`, 'x')
    expect(result).toEqual({ value: 1024 })
  })

  it('reports unsupported binary operators', async () => {
    const result = await extractFor(`export const x = 1 && 2`, 'x')
    expect(result).toEqual({
      unsupported: 'Unsupported binary operator "&&"',
      path: 'x',
    })
  })

  it('reports unsupported unary operators', async () => {
    const result = await extractFor(`export const x = !true`, 'x')
    expect(result).toEqual({
      unsupported: 'Unsupported unary operator "!"',
      path: 'x',
    })
  })

  it('still rejects unsupported nested nodes', async () => {
    const result = await extractFor(`export const x = 1 + foo`, 'x')
    expect(result).toEqual({
      unsupported: 'Unknown identifier "foo"',
      path: 'x',
    })
  })
})
