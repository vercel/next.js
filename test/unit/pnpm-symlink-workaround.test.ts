import {
  getPnpmSymlinkWorkaround,
  hasNodeRealpathFix,
} from '../lib/pnpm-symlink-workaround'

describe('pnpm symlink workaround', () => {
  it.each(['20.9.0', '22.23.2', '24.20.0', '25.9.0', '26.7.0'])(
    'applies on affected Node.js %s',
    (nodeVersion) => {
      expect(hasNodeRealpathFix(nodeVersion)).toBe(false)
      expect(getPnpmSymlinkWorkaround(nodeVersion)).toEqual({
        '.npmrc': expect.stringContaining('node-linker=hoisted'),
      })
    }
  )

  it.each(['24.21.0', '24.22.0', '26.8.0', '27.0.0'])(
    'uses normal pnpm linking on fixed Node.js %s',
    (nodeVersion) => {
      expect(hasNodeRealpathFix(nodeVersion)).toBe(true)
      expect(getPnpmSymlinkWorkaround(nodeVersion)).toBeUndefined()
    }
  )
})
