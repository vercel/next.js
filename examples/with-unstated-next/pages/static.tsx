/*
Static Generation

This page is the simplest form. Everything is initialized client-side.

At `yarn build`, there is no getStaticProps or getServerSideProps, so next
knows it can statically-render the entire page. It will use the 
initial state passed into the Provider.

SAMPLE OUTPUT:

<div id="__next">
  <div><button>-</button><span>1585505254535</span><button>+</button></div>
</div>
<script id="__NEXT_DATA__" type="application/json">
  {
    "props": { "pageProps": { "count": 1585505254535 } },
    "page": "/static",
    "query": {},
    "buildId": "WR7yhdoABPtlP2VcVweN5",
    "nextExport": true,
    "autoExport": true,
    "isFallback": false
  }
</script>

When the app boots client-side, __NEXT_DATA__ is used to initialize the
page props and reactive rendering begins.
*/

import { NextPage } from 'next'
import { Counter } from '../components/Counter'
import { CounterStore } from '../store'

const Ssg: NextPage = (props) => {
  console.log('static props', props)
  return (
    <CounterStore.Provider initialState={new Date().getTime()}>
      <Counter />
    </CounterStore.Provider>
  )
}

export default Ssg
