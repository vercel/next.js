/* global describe, it, expect */
import { loadGetInitialProps } from '../../dist/lib/utils'

describe('loadGetInitialProps', () => {
  it('should throw if getInitialProps is defined as an instance method', () => {
    class TestComponent {
      getInitialProps () {}
    }
    const rejectPromise = loadGetInitialProps(TestComponent, {})
    const error = new Error('"TestComponent.getInitialProps()" is defined as an instance method - visit https://err.sh/zeit/next.js/get-inital-props-as-an-instance-method for more information.')
    return expect(rejectPromise).rejects.toEqual(error)
  })

  it('should resolve to an object if getInitialProps is missing', async () => {
    const result = await loadGetInitialProps(() => {}, {})
    expect(result).toEqual({})
  })

  it('should resolve getInitialProps', async () => {
    class TestComponent {
      static async getInitialProps () {
        return { foo: 1 }
      }
    }
    const result = await loadGetInitialProps(TestComponent, {})
    expect(result).toEqual({ foo: 1 })
  })

  it('should be able to return an invalid value if the request was already sent', async () => {
    class TestComponent {
      static async getInitialProps () {
        return 'invalidValue'
      }
    }
    const ctx = {
      res: {
        finished: true
      }
    }
    const result = await loadGetInitialProps(TestComponent, ctx)
    expect(result).toBe('invalidValue')
  })

  it('should throw if getInitialProps won\'t return an object ', () => {
    class TestComponent {
      static async getInitialProps () {}
    }
    const rejectPromise = loadGetInitialProps(TestComponent, {})
    const error = new Error('"TestComponent.getInitialProps()" should resolve to an object. But found "undefined" instead.')
    return expect(rejectPromise).rejects.toEqual(error)
  })
})
