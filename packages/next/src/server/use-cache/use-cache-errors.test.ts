import { annotateUseCacheFunctionSerializationError } from './use-cache-errors'

const REACT_MESSAGE =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

describe('annotateUseCacheFunctionSerializationError', () => {
  it('appends a use cache serialization hint', () => {
    const error = new Error(
      REACT_MESSAGE + '\n  [function PostContent]\n   ^^^^^^^^^^^'
    )
    // Simulate V8's multi-line message prefix in the stack.
    error.stack = `${error.name}: ${error.message}\n    at getCachedComponent (app/page.tsx:3:1)`

    annotateUseCacheFunctionSerializationError(error)

    expect(error.message).toContain(REACT_MESSAGE)
    expect(error.message).toContain('"use cache"')
    expect(error.message).toContain(
      'https://nextjs.org/docs/app/api-reference/directives/use-cache'
    )
    expect(error.message).toContain('return JSX or serializable data')
    expect(error.message).toContain('component reference')
    expect(error.message).toContain('[function PostContent]')

    // React's annotation must appear once in the stack, not duplicated by a
    // first-line-only message rewrite.
    expect(error.stack?.match(/\[function PostContent\]/g)).toHaveLength(1)
    expect(error.stack?.match(/^\s+\^\^\^/gm)).toHaveLength(1)
    expect(error.stack).toContain('at getCachedComponent (app/page.tsx:3:1)')
  })

  it('does not annotate unrelated errors', () => {
    const error = new Error('Something else went wrong')
    annotateUseCacheFunctionSerializationError(error)
    expect(error.message).toBe('Something else went wrong')
  })

  it('does not append the hint twice', () => {
    const error = new Error(REACT_MESSAGE)
    annotateUseCacheFunctionSerializationError(error)
    const once = error.message
    annotateUseCacheFunctionSerializationError(error)
    expect(error.message).toBe(once)
  })
})
