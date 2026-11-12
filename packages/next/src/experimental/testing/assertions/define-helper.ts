/*!
 * Assertion helper behavior adapted from Vitest 5.0.4.
 *
 * MIT License
 *
 * Copyright (c) 2021-Present VoidZero Inc. and Vitest contributors
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

export function defineHelper<F extends (...args: any) => any>(fn: F): F {
  return function __VITEST_HELPER__(this: unknown, ...args: unknown[]) {
    const result = fn.apply(this, args)
    if (
      result &&
      typeof result === 'object' &&
      typeof result.then === 'function'
    ) {
      const stackTraceError = new Error('STACK_TRACE_ERROR')
      // Both names are Vitest's markers for trimming nested helper frames.
      // eslint-disable-next-line @typescript-eslint/no-shadow
      return (async function __VITEST_HELPER__() {
        try {
          return await result
        } catch (error) {
          if (
            error instanceof Error &&
            !error.stack?.includes('__VITEST_HELPER__') &&
            stackTraceError.stack !== undefined
          ) {
            error.stack = stackTraceError.stack.replace(
              stackTraceError.message,
              error.message
            )
          }
          throw error
        }
      })()
    }
    return result
  } as F
}
