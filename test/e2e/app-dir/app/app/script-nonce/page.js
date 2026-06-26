import Script from 'next/script'
import { ShowScriptOrder } from './show-order'

export default function Page() {
  return (
    <>
      <p>script-nonce</p>
      <Script strategy="afterInteractive" src="/test1.js" />
      <Script strategy="beforeInteractive" src="/test2.js" />
      <Script strategy="beforeInteractive" id="3" />
      <ShowScriptOrder />
    </>
  )
}
