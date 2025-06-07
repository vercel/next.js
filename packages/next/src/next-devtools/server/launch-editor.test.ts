import { escapeApplescriptStringFragment } from './launch-editor'

describe('applescript string escaping', () => {
  it('should escape strings correctly', () => {
    const result = escapeApplescriptStringFragment(`abc\\def"ghi\\\\`)
    expect(result).toBe(`abc\\\\def\\"ghi\\\\\\\\`)
  })
})
