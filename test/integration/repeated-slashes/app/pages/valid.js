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
      <p id="valid">valid page</p>

      <Link href="https://web.archive.org/web/20220627003332/https://github.com/">
        <a id="href-with-slashes">
          to https://web.archive.org/web/https://github.com/
        </a>
      </Link>
      <br />
    </>
  )
}
