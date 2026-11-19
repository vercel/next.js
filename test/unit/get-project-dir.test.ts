/* eslint-env jest */
import { getProjectDir } from 'next/dist/lib/get-project-dir'

describe('getProjectDir', () => {
  it('should return valid project dir for current directory', () => {
    const dir = getProjectDir('.')
    expect(typeof dir).toBe('string')
    expect(dir.length).toBeGreaterThan(0)
  })

  if (process.platform === 'win32') {
    it('should align drive-letter casing with Next.js location on Windows', () => {
      const root = process.cwd()
      const nextDrive = __dirname[0]
      // Test with inverse casing of the drive letter
      const invertedDrive =
        nextDrive === nextDrive.toUpperCase()
          ? nextDrive.toLowerCase()
          : nextDrive.toUpperCase()

      const testPath = invertedDrive + root.slice(1)
      const result = getProjectDir(testPath)

      // The returned path must match Next.js's drive letter casing
      expect(result[0]).toBe(nextDrive)
    })
  }
})
