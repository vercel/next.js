import Link from 'next/link'

export default () => (
  <>
    <h3 id="nav">Nav</h3>
    <Link href="/hello" as="/first">
      <a id="to-hello">to hello</a>
    </Link>
    <Link href="/hello-again" as="/second">
      <a id="to-hello-again">to hello-again</a>
    </Link>
  </>
)
