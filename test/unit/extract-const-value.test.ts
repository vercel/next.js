import { extractExportedConstValue } from 'next/src/build/analysis/extract-const-value'
import { parse } from '@swc/core'

async function parseCode(code: string) {
  return parse(code, { syntax: 'typescript' })
}

describe('extractExportedConstValue', () => {
  it('extracts string literal', async () => {
    const ast = await parseCode(`export const foo = "bar"`)
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'value' in result && result.value).toBe('bar')
  })

  it('extracts template literal', async () => {
    const ast = await parseCode('export const foo = `/api/test`')
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'value' in result && result.value).toBe('/api/test')
  })

  it('extracts String.raw tagged template', async () => {
    const ast = await parseCode(
      'export const foo = String.raw`/api/:path*`'
    )
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'value' in result && result.value).toBe('/api/:path*')
  })

  it('extracts String.raw with backslashes preserved', async () => {
    const ast = await parseCode(
      'export const foo = String.raw`\\n\\t`'
    )
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'value' in result && result.value).toBe('\\n\\t')
  })

  it('extracts array with String.raw elements', async () => {
    const ast = await parseCode(
      'export const matcher = [String.raw`/api/:path*`, "/about"]'
    )
    const result = extractExportedConstValue(ast, 'matcher')
    expect(result).not.toBeNull()
    expect(result && 'value' in result && result.value).toEqual([
      '/api/:path*',
      '/about',
    ])
  })

  it('returns unsupported for String.raw with expressions', async () => {
    const ast = await parseCode(
      'export const foo = String.raw`/api/${path}`'
    )
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'unsupported' in result).toBe(true)
    expect(
      result && 'unsupported' in result && result.unsupported
    ).toContain('Unsupported String.raw template literal with expressions')
  })

  it('returns unsupported for non-String.raw tagged template', async () => {
    const ast = await parseCode('export const foo = html`<div>test</div>`')
    const result = extractExportedConstValue(ast, 'foo')
    expect(result).not.toBeNull()
    expect(result && 'unsupported' in result).toBe(true)
    expect(
      result && 'unsupported' in result && result.unsupported
    ).toContain('Unsupported tagged template expression')
  })
})
