import { useEffect } from 'react'
import Router from 'next/router'

let runCount = 0

const IndexPage = ({ query }) => {
  // For test assertions - track how many times getInitialProps runs
  useEffect(() => {
    window.__getInitialPropsRunCount = runCount
  }, [])

  return (
    <>
      <div id="query-value">
        {/* This should update on each Router.replace */}
        test: {query.test}
      </div>
      <button
        id="trigger-query-hash-replace"
        onClick={() => {
          const { route } = Router
          const asPath = window.location.pathname
          Router.replace(route + `?test=123#hash`, asPath + '#hash')
        }}
      >
        Update Query With Hash
      </button>
    </>
  )
}

IndexPage.getInitialProps = async ({ query }) => {
  runCount++
  return { query }
}

export default IndexPage