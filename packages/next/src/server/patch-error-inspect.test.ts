/**
 * Unit tests for patch-error-inspect.ts
 */

import { patchErrorInspectNodeJS, parseFrames } from './patch-error-inspect'

describe('parseFrames', () => {
  /**
   * Tests for parseFrames which parses stack strings into CapturedFrame format.
   * This is the fallback path when errors are serialized across process boundaries.
   */

  it('should parse basic stack frames', () => {
    const stack = `Error: test
    at myFunction (/app/test.js:10:5)
    at otherFunction (/app/other.js:20:10)`

    const result = parseFrames(stack)

    expect(result).toHaveLength(2)
    expect(result[0].functionName).toBe('myFunction')
    expect(result[0].fileName).toBe('/app/test.js')
    expect(result[0].lineNumber).toBe(10)
    expect(result[0].columnNumber).toBe(5)
  })

  it('should extract "async " prefix from method names', () => {
    const stack = `Error: test
    at async myAsyncFunction (/app/test.js:10:5)`

    const result = parseFrames(stack)

    expect(result[0].functionName).toBe('myAsyncFunction')
    expect(result[0].isAsync).toBe(true)
    expect(result[0].isConstructor).toBe(false)
  })

  it('should extract "new " prefix from method names', () => {
    const stack = `Error: test
    at new MyClass (/app/test.js:10:5)`

    const result = parseFrames(stack)

    expect(result[0].functionName).toBe('MyClass')
    expect(result[0].isAsync).toBe(false)
    expect(result[0].isConstructor).toBe(true)
  })

  it('should extract both "async " and "new " prefixes', () => {
    const stack = `Error: test
    at async new MyClass (/app/test.js:10:5)`

    const result = parseFrames(stack)

    expect(result[0].functionName).toBe('MyClass')
    expect(result[0].isAsync).toBe(true)
    expect(result[0].isConstructor).toBe(true)
  })
})

describe('parseFrames matches captured frames', () => {
  /**
   * Verify that parseFrames produces equivalent output to our prepareStackTrace hook.
   * This ensures the fallback path works correctly.
   */

  beforeAll(() => {
    patchErrorInspectNodeJS(Error)
  })

  it('should match for basic function', () => {
    function testFunction() {
      return new Error('test')
    }
    const error = testFunction()
    const parsed = parseFrames(error.stack!)

    // Find our test function in the parsed stack
    const frame = parsed.find((f) => f.functionName === 'testFunction')
    expect(frame).toBeDefined()
    expect(frame!.fileName).toContain('patch-error-inspect.test.ts')
  })

  it('should match for constructor', () => {
    class TestClass {
      error: Error
      constructor() {
        this.error = new Error('test')
      }
    }
    const instance = new TestClass()
    const parsed = parseFrames(instance.error.stack!)

    const frame = parsed.find((f) => f.functionName === 'TestClass')
    expect(frame).toBeDefined()
    expect(frame!.isConstructor).toBe(true)
  })

  it('should match for class method', () => {
    class TestClass {
      testMethod() {
        return new Error('test')
      }
    }
    const instance = new TestClass()
    const error = instance.testMethod()
    const parsed = parseFrames(error.stack!)

    // V8 formats as "TypeName.methodName" which gets parsed as the full method name
    const frame = parsed.find((f) => f.functionName === 'TestClass.testMethod')
    expect(frame).toBeDefined()
  })
})
