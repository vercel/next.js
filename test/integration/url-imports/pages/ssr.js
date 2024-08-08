import value from 'http://localhost:12345/value2.js'

const url = new URL(
  'https://github.com/vercel/next.js/raw/canary/test/integration/url/public/vercel.png?_=ssr',
  import.meta.url
)

export function getServerSideProps() {
  return {
    props: {
      value,
      url: url.pathname,
    },
  }
}

export default function Index({ value: serverValue, url: serverUrl }) {
  return (
    <div>
      Hello {serverValue}+{value}+{serverUrl}+{url.pathname}
    </div>
  )
}
