import Link from 'next/link'
import Script from 'next/script'

export default function NotFound() {
  return (
    <>
      <Script
        id="not-found-inline"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
            window.executedScripts = (window.executedScripts || []).concat('not-found-inline');
          `,
        }}
      />
      <p id="not-found">not found</p>
      <Link id="to-home" href="/">
        home
      </Link>
    </>
  )
}
