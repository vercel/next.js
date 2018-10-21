import React from 'react'
import NoSSR from 'react-no-ssr'
import Loading from '../components/Loading'

export default () => (
  <main>
    <section>
      <h1>This section is server-side rendered.</h1>
    </section>

    <NoSSR onSSR={<Loading />}>
      <section>
        <h2>
          This section is <em>only</em> client-side rendered.
        </h2>
      </section>
    </NoSSR>

    <style jsx>{`
      section {
        align-items: center;
        display: flex;
        height: 50vh;
        justify-content: center;
      }
    `}</style>
  </main>
)
