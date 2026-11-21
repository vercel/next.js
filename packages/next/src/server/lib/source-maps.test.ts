import { findSourceMap, SourceMap } from 'module'
import {
  filterStackFrameDEV,
  filterStackFrameForErrorDEV,
  ignoreListAnonymousStackFramesIfSandwiched,
  isThirdPartyStackFrame,
} from './source-maps'

jest.mock('module', () => ({
  ...jest.requireActual('module'),
  findSourceMap: jest.fn(),
}))

describe('dependency frames in validation errors', () => {
  afterEach(() => {
    jest.mocked(findSourceMap).mockReset()
  })

  it.each<[string, boolean]>([
    ['file:///app/node_modules/date-library/index.js', true],
    ['C:\\app\\node_modules\\date-library\\index.js', true],
    [
      '/app/node_modules/.pnpm/date-library@1.0.0/node_modules/date-library/index.js',
      true,
    ],
    ['webpack://app/./node_modules/@example/date-library/index.js', true],
    ['node_modules/date-library/index.js', true],
    ['/app/node_modules/next/dist/server/app-render.js', false],
    ['/app/node_modules/@next/env/dist/index.js', false],
    ['/app/node_modules/', false],
    ['/app/node_modules/react/index.js', false],
    ['/app/node_modules/react-dom/server.js', false],
    ['/app/node_modules/react-server-dom-webpack/server.js', false],
    ['/app/node_modules/react-server-dom-turbopack/server.js', false],
    ['/app/node_modules/scheduler/index.js', false],
    ['/app/node_modules/.pnpm/react@19/node_modules/react/index.js', false],
    ['/app/node_modules/react-datepicker/index.js', true],
    ['/app/not_node_modules/date-library/index.js', false],
    ['/app/.next/server/chunks/node_modules_next.js', false],
    ['node:internal/process/task_queues', false],
    ['/app/page.js', false],
  ])('classifies %s', (sourceURL, expected) => {
    expect(isThirdPartyStackFrame(sourceURL)).toBe(expected)
  })

  it('retains external dependency frames only for error delivery', () => {
    const sourceURL = '/app/node_modules/date-library/index.js'
    expect(filterStackFrameDEV(sourceURL, 'readCurrentTime', 2, 10)).toBe(false)
    expect(
      filterStackFrameForErrorDEV(sourceURL, 'readCurrentTime', 2, 10)
    ).toBe(true)
    expect(
      filterStackFrameForErrorDEV(
        'node:internal/process/task_queues',
        'nextTick',
        1,
        1
      )
    ).toBe(false)
  })

  it.each<[string, boolean]>([
    ['date-library', true],
    ['next', false],
    ['react', false],
  ])(
    'resolves bundled %s frames without changing the shared filter',
    (name, expected) => {
      const payload = {
        version: 3,
        sources: [`file:///app/node_modules/${name}/index.js`],
        names: [],
        mappings: 'AAAA',
        ignoreList: [0],
      }
      jest.mocked(findSourceMap).mockReturnValue(new SourceMap(payload))

      const sourceURL = '/app/.next/server/chunks/library.js'
      expect(filterStackFrameDEV(sourceURL, 'readCurrentTime', 1, 1)).toBe(
        false
      )
      expect(
        filterStackFrameForErrorDEV(sourceURL, 'readCurrentTime', 1, 1)
      ).toBe(expected)
    }
  )

  it('uses the mapped position when a chunk contains framework and dependency sources', () => {
    const payload = {
      version: 3,
      sources: [
        'file:///app/node_modules/next/index.js',
        'file:///app/node_modules/date-library/index.js',
      ],
      names: [],
      mappings: 'AAAA;ACAA',
      ignoreList: [0, 1],
    }
    jest.mocked(findSourceMap).mockReturnValue(new SourceMap(payload))

    const sourceURL = '/app/.next/server/chunks/library.js'
    expect(filterStackFrameForErrorDEV(sourceURL, 'framework', 1, 1)).toBe(
      false
    )
    expect(filterStackFrameForErrorDEV(sourceURL, 'dependency', 2, 1)).toBe(
      true
    )
  })
})

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
