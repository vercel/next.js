import value from 'http://localhost:12345/value1.js'

const url = new URL(
  'https://github.com/vercel/next.js/raw/canary/test/integration/url/public/vercel.png?_=ssg',
  import.meta.url
)

export async function getStaticProps() {
  return {
    props: {
      value,
      url: url.pathname,
    },
  }
}

export default function Index({ value: staticValue, url: staticUrl }) {
  return (
    <div>
      Hello {staticValue}+{value}+{staticUrl}+{url.pathname}
    </div>
  )
}
