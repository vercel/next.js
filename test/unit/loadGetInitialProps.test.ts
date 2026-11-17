/* eslint-env jest */
import { loadGetInitialProps } from 'next/dist/shared/lib/utils'

describe('loadGetInitialProps', () => {
  it('should throw if getInitialProps is defined as an instance method', () => {
    class TestComponent {
      getInitialProps() {}
    }
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    const rejectPromise = loadGetInitialProps(TestComponent as any, {})
    const error = new Error(
      '"TestComponent.getInitialProps()" is defined as an instance method - visit https://nextjs.org/docs/messages/get-initial-props-as-an-instance-method for more information.'
    )
    return expect(rejectPromise).rejects.toEqual(error)
  })

  it('should resolve to an empty object if getInitialProps is missing', async () => {
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    const result = await loadGetInitialProps((() => {}) as any, {})
    expect(result).toEqual({})
  })

  it('should resolve getInitialProps', async () => {
    class TestComponent {
      static async getInitialProps() {
        return { foo: 1 }
      }
    }
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    const result = await loadGetInitialProps(TestComponent as any, {})
    expect(result).toEqual({ foo: 1 })
  })

  it('should be able to return an invalid value if the request was already sent', async () => {
    class TestComponent {
      static async getInitialProps() {
        return 'invalidValue'
      }
    }
    const ctx: any = {
      res: {
        finished: true,
      },
    }
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    const result = await loadGetInitialProps(TestComponent as any, ctx)
    expect(result).toBe('invalidValue')
  })

  it("should throw if getInitialProps won't return an object ", () => {
    class TestComponent {
      static async getInitialProps() {}
    }
    // TODO(as-any): pre-existing cast, not yet reviewed
    // eslint-disable-next-line @next/internal/no-as-any
    const rejectPromise = loadGetInitialProps(TestComponent as any, {})
    const error = new Error(
      '"TestComponent.getInitialProps()" should resolve to an object. But found "undefined" instead.'
    )
    return expect(rejectPromise).rejects.toEqual(error)
  })
})
