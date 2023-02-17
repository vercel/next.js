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
      <Link href="/another" as="/vercel//next.js" id="page-with-as-slashes">
        to /another as /vercel//next.js
      </Link>
      <br />

      <Link href="/vercel//next.js" id="href-with-slashes">
        to /vercel//next.js
      </Link>
      <br />

      <Link href="/vercel//next.js?hello=1" id="href-with-slashes-query">
        to /vercel//next.js?hello=1
      </Link>
      <br />

      <Link href="/vercel//next.js#hello" id="href-with-slashes-hash">
        to /vercel//next.js#hello
      </Link>
      <br />

      <Link
        href="/another"
        as="\/vercel\/\/next.js"
        id="page-with-as-backslashes"
      >
        to /another as \\/vercel\\/\\/next.js
      </Link>
      <br />

      <Link href="\/vercel\/\/next.js" id="href-with-backslashes">
        to \\/vercel\\/\\/next.js
      </Link>
      <br />

      <Link href="\/vercel\/\/next.js?hello=1" id="href-with-backslashes-query">
        to \\/vercel\\/\\/next.js?hello=1
      </Link>
      <br />

      <Link href="\/vercel\/\/next.js#hello" id="href-with-backslashes-hash">
        to \\/vercel\\/\\/next.js#hello
      </Link>
      <br />
    </>
  )
}
