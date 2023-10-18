import Script from 'next/script'

export default function Page() {
  return (
    <>
      <Script strategy="afterInteractive" src="/test1.js" />
      <Script strategy="beforeInteractive" src="/test2.js" />
      <Script strategy="beforeInteractive" id="3">{`
        ;(window._script_order = window._script_order || []).push(3)
        console.log(window._script_order)
      `}</Script>
    </>
  )
}
