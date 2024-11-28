import { normalizeNodeModuleFilePath } from './normalize-node-modules-filepath'

describe('normalizeNodeModuleFilePath', () => {
  it('should normalize basic node_modules filepath', () => {
    expect(normalizeNodeModuleFilePath('node_modules/foo/bar')).toBe(
      'node_modules/foo/bar'
    )
    expect(
      normalizeNodeModuleFilePath('node_modules/.pnpm/foo/node_modules/bar')
    ).toBe('node_modules/bar')
    expect(
      normalizeNodeModuleFilePath('node_modules/.yarn/foo/node_modules/bar')
    ).toBe('node_modules/bar')
    expect(normalizeNodeModuleFilePath('javascript/node_modules/foo/bar')).toBe(
      'node_modules/foo/bar'
    )
  })

  it('should normalize nested pnpm filepath', () => {
    expect(
      normalizeNodeModuleFilePath('node_modules/.pnpm/foo/node_modules/bar')
    ).toBe('node_modules/bar')
    expect(
      normalizeNodeModuleFilePath(
        'node_modules/.pnpm/react-dom@19.0.0/node_modules/react-dom/index.js'
      )
    ).toBe('node_modules/react-dom/index.js')
    expect(
      normalizeNodeModuleFilePath(
        'node_modules/.pnpm/postcss@8.4.31/node_modules/source-map-js'
      )
    ).toBe('node_modules/source-map-js')
  })

  it('should normalize yarn PnP node_modules filepath', () => {
    expect(
      normalizeNodeModuleFilePath('node_modules/.yarn/foo/node_modules/bar')
    ).toBe('node_modules/bar')
    expect(
      normalizeNodeModuleFilePath('node_modules/.yarn/foo/node_modules/bar')
    ).toBe('node_modules/bar')
    expect(
      normalizeNodeModuleFilePath('.yarn/foo/node_modules/foo/node_modules/bar')
    ).toBe('node_modules/bar')
  })

  it('should handle windows paths', () => {
    expect(
      normalizeNodeModuleFilePath('node_modules\\.yarn\\foo\\node_modules\\bar')
    ).toBe('node_modules\\bar')
    expect(
      normalizeNodeModuleFilePath('node_modules\\.pnpm\\foo\\node_modules\\bar')
    ).toBe('node_modules\\bar')
    expect(
      normalizeNodeModuleFilePath('javascript\\node_modules\\foo\\bar')
    ).toBe('node_modules\\foo\\bar')
  })
})
