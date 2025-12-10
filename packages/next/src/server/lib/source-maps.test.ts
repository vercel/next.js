import { ignoreListAnonymousStackFramesIfSandwiched } from './source-maps'

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
