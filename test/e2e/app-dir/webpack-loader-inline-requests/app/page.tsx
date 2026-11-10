import requests from '../fixtures/input.requestgen'
import css from '../fixtures/text.string-style'
import Client from './client'
import isomorphic from '../fixtures/styles.isomorphic-style'
import hotCss from '../fixtures/styles.hot-style'
import '../fixtures/styles.universal-style'

export default async function Page() {
  return (
    <>
      <pre id="requests">
        {JSON.stringify({ ...requests, dynamic: await requests.dynamic() })}
      </pre>
      <pre id="css">{css}</pre>
      <pre id="isomorphic-css">{isomorphic._getCss()}</pre>
      <pre id="hot-css">{hotCss}</pre>
      <Client />
    </>
  )
}
