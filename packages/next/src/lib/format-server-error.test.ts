import { formatServerError } from './format-server-error'

describe('formatServerError', () => {
  it('should hint about use cache when a function fails to serialize', () => {
    const err = new Error(
      'Functions cannot be passed directly to Client Components unless you explicitly expose it by marking it with "use server". Or maybe you meant to call this function rather than return it.\n  [function fn]\n   ^^^^^^^^^^^'
    )
    err.stack = `${err.name}: ${err.message}\n    at createCachedFn (app/page.tsx:8:3)`

    formatServerError(err)

    expect(err.message).toContain('"use cache"')
    expect(err.message).toContain(
      'https://nextjs.org/docs/app/api-reference/directives/use-cache'
    )
    expect(err.message).toContain('[function fn]')
    expect(err.stack?.match(/\[function fn\]/g)).toHaveLength(1)
    expect(err.stack?.match(/^\s+\^\^\^/gm)).toHaveLength(1)
    expect(err.stack).toContain('at createCachedFn (app/page.tsx:8:3)')

    const once = err.message
    formatServerError(err)
    expect(err.message).toBe(once)
  })

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
