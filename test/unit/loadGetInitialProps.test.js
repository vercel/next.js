/* global fixture, test */
import 'testcafe'
import { loadGetInitialProps } from 'next/dist/next-server/lib/utils'
import { didThrow } from 'next-test-utils'

fixture('loadGetInitialProps')

test('should throw if getInitialProps is defined as an instance method', async t => {
  class TestComponent {
    getInitialProps () {}
  }
  await didThrow(
    () => loadGetInitialProps(TestComponent, {}),
    true,
    /"TestComponent.getInitialProps\(\)" is defined as an instance method - visit https:\/\/err\.sh\/zeit\/next\.js\/get-initial-props-as-an-instance-method for more information\./
  )
})

test('should resolve to an empty object if getInitialProps is missing', async t => {
  const result = await loadGetInitialProps(() => {}, {})
  await t.expect(result).eql({})
})

test('should resolve getInitialProps', async t => {
  class TestComponent {
    static async getInitialProps () {
      return { foo: 1 }
    }
  }
  const result = await loadGetInitialProps(TestComponent, {})
  await t.expect(result).eql({ foo: 1 })
})

test('should be able to return an invalid value if the request was already sent', async t => {
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
  await t.expect(result).eql('invalidValue')
})

test("should throw if getInitialProps won't return an object ", async t => {
  class TestComponent {
    static async getInitialProps () {}
  }
  await didThrow(
    () => loadGetInitialProps(TestComponent, {}),
    true,
    /"TestComponent.getInitialProps\(\)" should resolve to an object\. But found "undefined" instead\./
  )
})
