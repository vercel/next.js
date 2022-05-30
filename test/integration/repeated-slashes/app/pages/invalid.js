import Link from 'next/link'

if (typeof window !== 'undefined') {
  window.caughtErrors = []
  const origError = window.console.error

  window.console.error = function (...args) {
    window.caughtErrors.push(args.join(' '))
    return origError(...args)
  }
}

export default function Invalid() {
  return (
    <>
      <p id="invalid">invalid page</p>
      <Link href="/another" as="//google.com">
        <a id="page-with-as-slashes">to /another as //google.com</a>
      </Link>
      <br />

      <Link href="//google.com">
        <a id="href-with-slashes">to //google.com</a>
      </Link>
      <br />

      <Link href="//google.com?hello=1">
        <a id="href-with-slashes-query">to //google.com?hello=1</a>
      </Link>
      <br />

      <Link href="//google.com#hello">
        <a id="href-with-slashes-hash">to //google.com#hello</a>
      </Link>
      <br />

      <Link href="/another" as="\/\/google.com">
        <a id="page-with-as-backslashes">to /another as \\/\\/google.com</a>
      </Link>
      <br />

      <Link href="\/\/google.com">
        <a id="href-with-backslashes">to \\/\\/google.com</a>
      </Link>
      <br />

      <Link href="\/\/google.com?hello=1">
        <a id="href-with-backslashes-query">to \\/\\/google.com?hello=1</a>
      </Link>
      <br />

      <Link href="\/\/google.com#hello">
        <a id="href-with-backslashes-hash">to \\/\\/google.com#hello</a>
      </Link>
      <br />
    </>
  )
}
