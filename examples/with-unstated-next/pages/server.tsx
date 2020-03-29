/*
Dynamic

This page is almost like static.tsx, but populates the app state at
build time. To do this, we take advantage of an initial set of 
props being passed in from getStaticProps.

For this example, getStaticProps simulates an async call that returns data.

At `yarn build`, getStaticProps is called. The return value is stored in
the static HTML file using __NEXT_DATA__. The component is also rendered
server-side, so the actual HTML rendering is also injected in the static HTML
file.

SAMPLE OUTPUT:

<div id="__next">
  <div><button>-</button><span>1585505254535</span><button>+</button></div>
</div>
<script id="__NEXT_DATA__" type="application/json">
  {
    "props": { "pageProps": { "count": 1585505254535 }, "__N_SSG": true },
    "page": "/static",
    "query": {},
    "buildId": "CHi3bLv0OzOE1Epvl4Yyz",
    "nextExport": false,
    "isFallback": false,
    "gsp": true
  }
</script>

When the app boots client-side, __NEXT_DATA__ is used to initialize the
page props and reactive rendering begins.
*/

import { NextPage, GetServerSideProps } from 'next'
import { Counter } from '../components/Counter'
import { CounterStore } from '../store'

interface ServerProps {
  count: number
}
const Server: NextPage<ServerProps> = (props) => {
  console.log('server props', props)
  return (
    <CounterStore.Provider initialState={props.count}>
      <Counter />
    </CounterStore.Provider>
  )
}

export const getServerSideProps: GetServerSideProps<ServerProps> = () => {
  return new Promise((resolve) => {
    resolve({ props: { count: new Date().getTime() } })
  })
}

export default Server
