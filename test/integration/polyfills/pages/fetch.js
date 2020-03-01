import { useState, useEffect } from 'react'
import unfetchImp from 'unfetch'
import isomorphicUnfetchImp from 'isomorphic-unfetch'

const testWhatwgFetchMethods = whatWgFetch => {
  return (
    whatWgFetch.Headers.name === 'Headers' &&
    whatWgFetch.Request.name === 'Request' &&
    whatWgFetch.Response.name === 'Response'
  )
}

const testFetchImports = async () => {
  const whatwgFetchImp = await import('whatwg-fetch')
  const whatwgFetchReq = require('whatwg-fetch')
  const unfetchReq = require('unfetch')
  const isomorphicUnfetchReq = require('isomorphic-unfetch')

  let areImportsMatching =
    [whatwgFetchImp.fetch, whatwgFetchReq.fetch].every(
      lib => lib.name === 'fetch'
    ) &&
    [unfetchImp, unfetchReq, isomorphicUnfetchImp, isomorphicUnfetchReq].every(
      lib => lib.name === 'bound fetch'
    )

  return areImportsMatching &&
    testWhatwgFetchMethods(whatwgFetchReq) &&
    testWhatwgFetchMethods(whatwgFetchImp)
    ? 'pass'
    : 'fail'
}

const Page = () => {
  const [testStatus, setTestStatus] = useState('computing')

  useEffect(() => {
    testFetchImports().then(status => {
      console.log(status)
      setTestStatus(status)
    })
  }, [])

  return <div id="test-status">{testStatus}</div>
}

export default Page
