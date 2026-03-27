import { resolveAppRelativeEditorPath } from './resolve-app-relative-editor-path'

describe('resolveAppRelativeEditorPath', () => {
  it('prefixes bare app-relative files inside app/', () => {
    expect(resolveAppRelativeEditorPath('layout.tsx', false)).toBe(
      'app/layout.tsx'
    )
  })

  it('prefixes bare app-relative files inside src/app/', () => {
    expect(resolveAppRelativeEditorPath('layout.tsx', true)).toBe(
      'src/app/layout.tsx'
    )
  })

  it('strips monorepo prefixes for app/ paths', () => {
    expect(
      resolveAppRelativeEditorPath('apps/docs/app/layout.tsx', false)
    ).toBe('app/layout.tsx')
  })

  it('strips monorepo prefixes for src/app/ paths', () => {
    expect(
      resolveAppRelativeEditorPath('packages/web/src/app/layout.tsx', true)
    ).toBe('src/app/layout.tsx')
  })

  it('rewrites app/ paths when src/app/ is expected', () => {
    expect(resolveAppRelativeEditorPath('app/layout.tsx', true)).toBe(
      'src/app/layout.tsx'
    )
  })

  it('rewrites src/app/ paths when app/ is expected', () => {
    expect(resolveAppRelativeEditorPath('src/app/layout.tsx', false)).toBe(
      'app/layout.tsx'
    )
  })

  it('normalizes windows separators before resolving', () => {
    expect(
      resolveAppRelativeEditorPath('apps\\docs\\app\\page.tsx', false)
    ).toBe('app/page.tsx')
  })
})
