import value from 'http://localhost:12345/value3.js'

const url = new URL(
  'https://github.com/vercel/next.js/raw/canary/test/integration/url/public/vercel.png?_=static',
  import.meta.url
)

export default function Index(props) {
  return (
    <div>
      Hello {value}+{value}+{url.pathname}+{url.pathname}
    </div>
  )
}
