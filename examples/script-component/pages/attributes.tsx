import Script from 'next/script'

export default function Inline() {
  return (
    <>
      {/* Attributes are forwarded */}
      <Script
        src="https://www.google-analytics.com/analytics.js"
        id="analytics"
        nonce="XUENAJFW"
        data-test="analytics"
      />

      <main>
        <h1>Forwarded attributes</h1>
        <h5>
          Open devtools and check that attributes has been forwarded correctly.
        </h5>
      </main>
    </>
  )
}
