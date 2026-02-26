import { fetchPkgInfo } from './patch-incorrect-lockfile'
import { getPkgManager } from './helpers/get-pkg-manager'
import os from 'os'
import process from 'process'

jest.mock('./helpers/get-pkg-manager')

const mockGetPkgManager = getPkgManager as jest.MockedFunction<
  typeof getPkgManager
>

describe('fetchPkgInfo integration tests', () => {
  // Change to a temp directory to avoid any interference from existing lockfiles
  const originalCwd = process.cwd()
  const testDir = os.tmpdir()

  beforeAll(() => {
    process.chdir(testDir)
  })

  afterAll(() => {
    process.chdir(originalCwd)
  })

  const testPackages = ['@next/swc-win32-x64-msvc', '@next/swc-linux-x64-gnu']

  const validatePkgInfo = (info: any, pkg: string) => {
    expect(info).toHaveProperty('os')
    expect(Array.isArray(info.os)).toBe(true)
    expect(info.os.length).toBeGreaterThan(0)
    expect(info).toHaveProperty('cpu')
    expect(Array.isArray(info.cpu)).toBe(true)
    expect(info.cpu.length).toBeGreaterThan(0)
    expect(info).toHaveProperty('engines')
    expect(info.engines).toHaveProperty('node')
    expect(info).toHaveProperty('tarball')
    expect(typeof info.tarball).toBe('string')
    expect(info).toHaveProperty('integrity')
    expect(typeof info.integrity).toBe('string')
    expect(info.cpu).toContain('x64')

    if (pkg.includes('win32')) {
      expect(info.os).toContain('win32')
    } else if (pkg.includes('linux')) {
      expect(info.os).toContain('linux')
    }
  }

  describe('npm', () => {
    it.each(testPackages)(
      'should fetch package info for %s using npm',
      async (pkg) => {
        mockGetPkgManager.mockReturnValue('npm')
        const info = await fetchPkgInfo(testDir, pkg)
        validatePkgInfo(info, pkg)
        expect(mockGetPkgManager).toHaveBeenCalledWith(testDir)
      }
    )
  })

  describe('yarn', () => {
    it.each(testPackages)(
      'should fetch package info for %s using yarn',
      async (pkg) => {
        mockGetPkgManager.mockReturnValue('yarn')
        const info = await fetchPkgInfo(testDir, pkg)
        validatePkgInfo(info, pkg)
        expect(mockGetPkgManager).toHaveBeenCalledWith(testDir)
      }
    )
  })

  describe('pnpm', () => {
    it.each(testPackages)(
      'should fetch package info for %s using pnpm',
      async (pkg) => {
        mockGetPkgManager.mockReturnValue('pnpm')
        const info = await fetchPkgInfo(testDir, pkg)
        validatePkgInfo(info, pkg)
        expect(mockGetPkgManager).toHaveBeenCalledWith(testDir)
      }
    )
  })
})
