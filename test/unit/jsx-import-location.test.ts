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

it('finds the package line for an aliased JSX import at the tag or name', () => {
  for (const column of [10, 11]) {
    expect(getJsxImportLocation(source, 5, column)).toEqual({
      line: 3,
      column: 8,
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
