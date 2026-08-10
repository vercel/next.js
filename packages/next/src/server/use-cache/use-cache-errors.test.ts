import { annotateUseCacheFunctionSerializationError } from './use-cache-errors'

const REACT_MESSAGE =
  'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.'

describe('annotateUseCacheFunctionSerializationError', () => {
  it('appends a use cache serialization hint', () => {
    const error = new Error(
      REACT_MESSAGE + '\n  [function PostContent]\n   ^^^^^^^^^^^'
    )

    annotateUseCacheFunctionSerializationError(error)

    expect(error.message).toContain(REACT_MESSAGE)
    expect(error.message).toContain('"use cache"')
    expect(error.message).toContain(
      'https://nextjs.org/docs/messages/use-cache-function'
    )
    expect(error.message).toContain('[function PostContent]')
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
