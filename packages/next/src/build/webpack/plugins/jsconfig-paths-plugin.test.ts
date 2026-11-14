import path from 'path'
import { resolveCandidatePath } from './jsconfig-paths-plugin'

describe('jsconfig-paths-plugin', () => {
  describe('resolveCandidatePath', () => {
    const base = path.resolve('/project')

    it('joins a bare relative path with the base URL', () => {
      expect(resolveCandidatePath(base, 'src/foo')).toBe(
        path.join(base, 'src/foo')
      )
    })

    it('joins a dot-relative path with the base URL', () => {
      expect(resolveCandidatePath(base, './src/foo')).toBe(
        path.join(base, './src/foo')
      )
    })

    it('returns an absolute path as-is without joining with base URL', () => {
      // TypeScript 5.5+ resolves the ${configDir} template variable in
      // compilerOptions.paths to an absolute path before Next.js reads
      // tsconfig.options.paths. Calling path.join(baseUrl, absolutePath)
      // would produce a wrong doubled path; the absolute value must be
      // used directly.
      const absolute = path.resolve('/project/src/foo')
      expect(resolveCandidatePath('/different/base', absolute)).toBe(absolute)
    })

    it('does not modify an absolute path even when base equals the path root', () => {
      const absolute = path.resolve('/project/src/foo')
      expect(resolveCandidatePath(path.resolve('/project'), absolute)).toBe(
        absolute
      )
    })
  })
})
