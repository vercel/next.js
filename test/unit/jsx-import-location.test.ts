import { loadBindings } from 'next/dist/build/swc'
import { getOriginalCodeFrame } from 'next/dist/next-devtools/server/shared'
import { getJsxImportLocation } from '../../packages/next/src/next-devtools/server/jsx-import-location'

const source = `import {
  Widget as Display,
} from 'external-time'
export function Page() {
  return <Display />
}
export function Local({ Display }) {
  return <Display />
}`

it('finds the whole import declaration for an aliased JSX import at the tag or name', () => {
  for (const column of [10, 11]) {
    expect(getJsxImportLocation(source, 5, column)).toEqual({
      startLine: 1,
      endLine: 3,
    })
  }
})

it('does not guess for shadowed names or a position outside the tag', () => {
  expect(getJsxImportLocation(source, 8, 10)).toBeUndefined()
  expect(getJsxImportLocation(source, 5, 20)).toBeUndefined()
})

it('keeps the original frame for local imports, malformed source and missing columns', () => {
  expect(
    getJsxImportLocation(source.replace('external-time', './local'), 5, 10)
  ).toBeUndefined()
  expect(getJsxImportLocation(source + '\n{', 5, 10)).toBeUndefined()
  expect(getJsxImportLocation(source, 5, null)).toBeUndefined()
})

describe('import context in a source frame', () => {
  beforeAll(async () => {
    await loadBindings()
  })

  const declaration = [
    'import {',
    '  Widget as Display,',
    "} from 'external-time'",
  ]
  const component = ['export function Page() {', '  return <Display />', '}']

  it.each(['above', 'below'] as const)(
    'shows a distant multiline import %s the JSX in source order',
    (position) => {
      const gap = Array.from({ length: 20 }, (_, i) => '// comment ' + i)
      const lines =
        position === 'above'
          ? [...declaration, ...gap, ...component]
          : [...component, ...gap, ...declaration]
      const frame = getOriginalCodeFrame(
        {
          file: 'page.jsx',
          methodName: 'Page',
          arguments: [],
          ignored: false,
          line1: lines.indexOf(component[1]) + 1,
          column1: 10,
        },
        lines.join('\n'),
        { colors: false, showJsxImport: true }
      )
      expect(frame).not.toBeNull()
      const rows = frame!.split('\n')
      const importRow = rows.findIndex((row) => /\| import \{/.test(row))
      const jsxRow = rows.findIndex((row) => /^>.*<Display \/>/.test(row))
      expect(importRow).toBeGreaterThanOrEqual(0)
      expect(jsxRow).toBeGreaterThanOrEqual(0)
      expect(importRow < jsxRow).toBe(position === 'above')
      expect(rows[importRow + 1]).toContain('Widget as Display,')
      expect(rows[importRow + 2]).toContain("} from 'external-time'")
      expect(rows[jsxRow + 1]).toContain('^')
      expect(rows.filter((row) => row.includes('^'))).toHaveLength(1)
      expect(frame).not.toContain('// comment 10')
    }
  )
})
