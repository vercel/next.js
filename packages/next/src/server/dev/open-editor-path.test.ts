import path from 'path'

import { getAppRelativeEditorPath } from './open-editor-path'

describe('getAppRelativeEditorPath', () => {
  it('puts src before app when the app directory lives under src', () => {
    expect(getAppRelativeEditorPath('layout.tsx', true)).toBe(
      path.join('src', 'app', 'layout.tsx')
    )
  })

  it('keeps the original app path when src is not used', () => {
    expect(getAppRelativeEditorPath('layout.tsx', false)).toBe(
      path.join('app', 'layout.tsx')
    )
  })
})
