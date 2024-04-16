import { Suspense } from 'react'

import Client from '../Client'
import Delayed from '../Delayed'
import Details from '../Details'

export default function Page() {
  return (
    <>
      <p>hello world</p>
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      <meta content="This is a long paragraph because I want to force the shell to stream over multiple chunks" />
      {/* <meta name="some n" /> */}
      {/* <meta name="some na" /> */}
      {/* <meta name="some nam" /> */}
      {/* <meta name="some name" /> */}
      <meta name="some name1" />
      {/* <meta name="some name12" /> */}
      {/* <meta name="some name123" /> */}
      {/* <meta name="some name1234" /> */}
      {/* <meta name="some name12345" /> */}
      {/* <meta name="some name123456" /> */}
      <Client />
      <Suspense fallback={<p>loading...</p>}>
        <Delayed ms={3000} />
      </Suspense>
      <Suspense fallback={<p>loading...</p>}>
        <Delayed ms={50} />
      </Suspense>
      <Details
        details={
          <Suspense fallback={<p>loading...</p>}>
            <Delayed ms={1500} postpone />
          </Suspense>
        }
      />
    </>
  )
}
