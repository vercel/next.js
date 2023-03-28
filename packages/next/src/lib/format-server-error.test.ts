import { formatServerError } from './format-server-error'

describe('formatServerError', () => {
  it('should not append message several times', () => {
    const err = new Error(
      'Class extends value undefined is not a constructor or null'
    )

    // Before
    expect(err.message).toMatchInlineSnapshot(
      `"Class extends value undefined is not a constructor or null"`
    )

    // After
    formatServerError(err)
    expect(err.message).toMatchInlineSnapshot(`
      "Class extends value undefined is not a constructor or null

      This might be caused by a React Class Component being rendered in a Server Component, React Class Components only works in Client Components. Read more: https://nextjs.org/docs/messages/class-component-in-server-component"
    `)

    // After second
    formatServerError(err)
    expect(err.message).toMatchInlineSnapshot(`
      "Class extends value undefined is not a constructor or null

      This might be caused by a React Class Component being rendered in a Server Component, React Class Components only works in Client Components. Read more: https://nextjs.org/docs/messages/class-component-in-server-component"
    `)
  })
})
