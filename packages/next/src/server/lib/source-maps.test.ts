import {
  ignoreListAnonymousStackFramesIfSandwiched,
  normalizeSourceUrl,
} from './source-maps'

type StackFrame = null | {
  file: string
  methodName: string
  ignored: boolean
}

// Reference implementation with nullable frames.
function ignoreList(frames: StackFrame[]) {
  ignoreListAnonymousStackFramesIfSandwiched(
    frames,
    (frame) => frame !== null && frame.file === '<anonymous>',
    (frame) => frame !== null && frame.ignored,
    (frame) => (frame === null ? '' : frame.methodName),
    (frame) => {
      frame!.ignored = true
    }
  )
}

test('hides small sandwiches', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: true, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ])
})

test('hides big sandwiches', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { file: 'file1.js', methodName: 'Page', ignored: true },
    { ignored: true, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ])
})

it('hides big macs', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'query' },
    { ignored: false, file: '<anonymous>', methodName: 'Set.forEach' },
    { ignored: true, file: 'file1.js', methodName: 'tryUser' },
    { ignored: false, file: '<anonymous>', methodName: 'Array.forEach' },
    { ignored: true, file: 'file1.js', methodName: 'getUser' },
    { ignored: false, file: 'page.js', methodName: 'Component' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: true, file: 'file1.js', methodName: 'query' },
    { ignored: true, file: '<anonymous>', methodName: 'Set.forEach' },
    { ignored: true, file: 'file1.js', methodName: 'tryUser' },
    { ignored: true, file: '<anonymous>', methodName: 'Array.forEach' },
    { ignored: true, file: 'file1.js', methodName: 'getUser' },
    { ignored: false, file: 'page.js', methodName: 'Component' },
  ])
})

test('does not hide sandwiches without a lid', () => {
  const frames: StackFrame[] = [
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ])
})

test('does not ignore list anonymous frames where the bottom is shown', () => {
  const frames: StackFrame[] = [
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ])
})

test('does not ignore list anonymous frames by default', () => {
  const frames: StackFrame[] = [
    { ignored: false, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: false, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ])
})

test('does not ignore list if bottom is not ignore-listed', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: 'file2.js', methodName: 'render' },
  ])
})

test('does not ignore list if top is not ignore-listed', () => {
  const frames: StackFrame[] = [
    { ignored: false, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: false, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ])
})

test('does not ignore list if top is unknown', () => {
  const frames: StackFrame[] = [
    null,
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'JSON.parse' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    null,
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: true, file: 'file2.js', methodName: 'JSON.parse' },
  ])
})

test('does not ignore list if bottom is unknown', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    null,
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: true, file: 'file1.js', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    { ignored: false, file: '<anonymous>', methodName: 'JSON.parse' },
    null,
  ])
})

test('does not ignore list anonymous frames that are not likely JS native methods', () => {
  const frames: StackFrame[] = [
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'body' },
    { ignored: false, file: '<anonymous>', methodName: 'html' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ]

  ignoreList(frames)

  expect(frames).toEqual([
    { ignored: true, file: 'file1.js', methodName: 'Page' },
    { ignored: false, file: '<anonymous>', methodName: 'body' },
    { ignored: false, file: '<anonymous>', methodName: 'html' },
    { ignored: true, file: 'file2.js', methodName: 'render' },
  ])
})

describe('normalizeSourceUrl', () => {
  // Import the source-map library to demonstrate its actual behavior
  const { SourceMapConsumer } = (require('next/dist/compiled/source-map') as typeof import('next/dist/compiled/source-map'))

  describe('file URL concatenation (source-map library bug)', () => {
    // The source-map library doesn't recognize file:/ (single slash) as an absolute URL,
    // so it concatenates sourceRoot with the file:/ source, producing malformed paths.
    // This test demonstrates the actual library behavior and verifies our fix.

    it('fixes malformed paths produced by source-map library with sourceRoot', () => {
      // Create a source map that triggers the bug:
      // - sourceRoot is a relative path
      // - source is a file:/ URL (single slash, which is technically valid but uncommon)
      const rawSourceMap = {
        version: 3,
        file: 'output.js',
        sourceRoot: '../../../',
        sources: ['file:/Users/foo/app/page.js'],
        names: [],
        mappings: 'AAAA', // Maps position (0,0) -> (0,0)
      }

      const consumer = new SourceMapConsumer(rawSourceMap)

      // Get the source URL as the library reports it
      const malformedSource = consumer.sources[0]

      // The library incorrectly concatenates sourceRoot with the file:/ URL
      expect(malformedSource).toBe('../../../file:/Users/foo/app/page.js')

      // Our normalizeSourceUrl fixes this malformed path
      expect(normalizeSourceUrl(malformedSource)).toBe(
        'file:///Users/foo/app/page.js'
      )
    })

    it('normalizes file:/ to file:// even without sourceRoot', () => {
      const rawSourceMap = {
        version: 3,
        file: 'output.js',
        sources: ['file:/Users/foo/app/page.js'],
        names: [],
        mappings: 'AAAA',
      }

      const consumer = new SourceMapConsumer(rawSourceMap)
      const source = consumer.sources[0]

      // Without sourceRoot, file:/ comes through as-is (still malformed)
      expect(source).toBe('file:/Users/foo/app/page.js')

      // Our fix normalizes it to the canonical file:// format
      expect(normalizeSourceUrl(source)).toBe('file:///Users/foo/app/page.js')
    })

    it('handles file:/// URLs correctly (no change needed)', () => {
      expect(normalizeSourceUrl('file:///Users/foo/app/page.js')).toBe(
        'file:///Users/foo/app/page.js'
      )
    })

    it('extracts last file:/ when multiple occurrences exist', () => {
      // Edge case: nested source maps could produce multiple file: occurrences
      expect(
        normalizeSourceUrl('file:/wrong/path/file:/correct/path/page.js')
      ).toBe('file:///correct/path/page.js')
    })
  })

  describe('duplicate path segments', () => {
    it('removes single duplicate segment', () => {
      expect(normalizeSourceUrl('app/app/page.tsx')).toBe('app/page.tsx')
    })

    it('removes multi-directory duplicate segment', () => {
      expect(normalizeSourceUrl('test/fixtures/test/fixtures/app.js')).toBe(
        'test/fixtures/app.js'
      )
    })

    it('removes duplicate with relative prefix preserved', () => {
      expect(
        normalizeSourceUrl('../../../app/components/app/components/Button.js')
      ).toBe('../../../app/components/Button.js')
    })
  })

  describe('paths that should not be modified', () => {
    it('does not modify consecutive .. segments', () => {
      expect(normalizeSourceUrl('../../page.js')).toBe('../../page.js')
    })

    it('does not modify paths with . in them', () => {
      expect(normalizeSourceUrl('./src/./page.js')).toBe('./src/./page.js')
    })

    it('does not modify normal relative paths', () => {
      expect(normalizeSourceUrl('src/components/page.js')).toBe(
        'src/components/page.js'
      )
    })

    it('does not modify webpack:// URLs', () => {
      expect(normalizeSourceUrl('webpack://app/./src/page.js')).toBe(
        'webpack://app/./src/page.js'
      )
    })

    it('does not modify turbopack:// URLs', () => {
      expect(normalizeSourceUrl('turbopack://[project]/src/page.js')).toBe(
        'turbopack://[project]/src/page.js'
      )
    })
  })
})
