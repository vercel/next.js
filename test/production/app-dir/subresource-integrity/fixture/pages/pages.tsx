import React from 'react'
import Script from 'next/script'

export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export default function Page() {
  return (
    <>
      <p>pages-nonce</p>
      <Script
        dangerouslySetInnerHTML={{ __html: 'console.log("hi")' }}
        strategy="afterInteractive"
      />
    </>
  )
}
