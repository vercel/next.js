import Link from 'next/link'
import Script from 'next/script'

const Page = () => {
  return (
    <div class="container">
      <Script id="inline-script">{`document.getElementById('text').textContent += 'abc'`}</Script>
      <Script
        id="inline-before"
        strategy="inlineBeforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `console.log('inlineBeforeInteractive')`,
        }}
      ></Script>
      <div>page5</div>
      <div>
        <Link href="/">Index</Link>
      </div>
    </div>
  )
}

export default Page
