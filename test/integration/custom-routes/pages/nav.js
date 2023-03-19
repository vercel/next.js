import Link from 'next/link'

const Page = () => (
  <>
    <h3 id="nav">Nav</h3>
    <Link href="/hello" as="/first" id="to-hello">
      to hello
    </Link>
    <br />
    <Link href="/hello-again" as="/second" id="to-hello-again">
      to hello-again
    </Link>
    <br />
    <Link
      href={{
        pathname: '/with-params',
        query: {
          something: 1,
          another: 'value',
        },
      }}
      as="/params/1?another=value"
      id="to-params-manual"
    >
      to params (manual)
    </Link>
    <br />
    <Link href="/params/1?another=value" id="to-params">
      to params
    </Link>
    <br />
    <Link href="/rewriting-to-auto-export" id="to-rewritten-dynamic">
      to rewritten dynamic
    </Link>
    <br />
    <Link href="/hello?overrideMe=1" id="to-overridden">
      to /hello?overrideMe=1
    </Link>
    <br />
    <Link href="/old-blog/about" id="to-old-blog">
      to /old-blog/post-1
    </Link>
    <br />
    <Link href="/overridden" id="to-before-files-overridden">
      to /overridden
    </Link>
    <br />
    <Link href="/nfl" id="to-before-files-dynamic">
      to /nfl
    </Link>
    <br />
    <Link href="/nfl/test" id="to-before-files-dynamic-again">
      to /nfl/test
    </Link>
    <br />
  </>
)

export default Page
