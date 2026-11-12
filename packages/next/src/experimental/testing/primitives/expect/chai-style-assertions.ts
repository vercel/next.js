import type { NextTestChai } from '../chai'
import type { Assertion, ChaiPlugin } from './types'

export const ChaiStyleAssertions: ChaiPlugin = (chai, utils) => {
  function defProperty(name: keyof Assertion, delegateTo: keyof Assertion) {
    utils.addProperty(
      chai.Assertion.prototype,
      name,
      function (this: NextTestChai.AssertionStatic & Assertion) {
        const jestMethod = (chai.Assertion.prototype as any)[delegateTo]
        if (!jestMethod) {
          throw new Error(
            `Cannot delegate to ${String(delegateTo)}: method not found. Ensure JestChaiExpect plugin is loaded first.`
          )
        }
        return jestMethod.call(this)
      }
    )
  }

  function defPropertyWithArgs(
    name: keyof Assertion,
    delegateTo: keyof Assertion,
    ...args: any[]
  ) {
    utils.addProperty(
      chai.Assertion.prototype,
      name,
      function (this: NextTestChai.AssertionStatic & Assertion) {
        const jestMethod = (chai.Assertion.prototype as any)[delegateTo]
        if (!jestMethod) {
          throw new Error(
            `Cannot delegate to ${String(delegateTo)}: method not found. Ensure JestChaiExpect plugin is loaded first.`
          )
        }
        return jestMethod.call(this, ...args)
      }
    )
  }

  function defMethod(name: keyof Assertion, delegateTo: keyof Assertion) {
    utils.addMethod(
      chai.Assertion.prototype,
      name,
      function (
        this: NextTestChai.AssertionStatic & Assertion,
        ...args: any[]
      ) {
        const jestMethod = (chai.Assertion.prototype as any)[delegateTo]
        if (!jestMethod) {
          throw new Error(
            `Cannot delegate to ${String(delegateTo)}: method not found. Ensure JestChaiExpect plugin is loaded first.`
          )
        }
        return jestMethod.call(this, ...args)
      }
    )
  }

  // API to (somewhat) mirror sinon-chai
  // https://github.com/chaijs/sinon-chai
  defProperty('called', 'toHaveBeenCalled')
  defProperty('calledOnce', 'toHaveBeenCalledOnce')
  defPropertyWithArgs('calledTwice', 'toHaveBeenCalledTimes', 2)
  defPropertyWithArgs('calledThrice', 'toHaveBeenCalledTimes', 3)

  defMethod('callCount', 'toHaveBeenCalledTimes')
  defMethod('calledWith', 'toHaveBeenCalledWith')
  defMethod('calledOnceWith', 'toHaveBeenCalledExactlyOnceWith')
  defMethod('lastCalledWith', 'toHaveBeenLastCalledWith')
  defMethod('nthCalledWith', 'toHaveBeenNthCalledWith')
  defMethod('returned', 'toHaveReturnedWith')
  defMethod('returnedWith', 'toHaveReturnedWith')
  defMethod('returnedTimes', 'toHaveReturnedTimes')
  defMethod('lastReturnedWith', 'toHaveLastReturnedWith')
  defMethod('nthReturnedWith', 'toHaveNthReturnedWith')
  defMethod('calledBefore', 'toHaveBeenCalledBefore')
  defMethod('calledAfter', 'toHaveBeenCalledAfter')

  // TODO: implement
  // defMethod('thrown', 'toHaveThrown')
}
