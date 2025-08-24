import React from 'react'
import Script from 'next/script'

export default () => (
  <div>
    <h1>I am a page to test next/script</h1>
    <Script src="/test-async-true.js" async />
    <Script src="/test-async-false.js" async={false} />
    <Script src="/test-defer.js" defer />
  </div>
)
