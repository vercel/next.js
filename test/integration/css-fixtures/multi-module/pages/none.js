import Link from 'next/link'

export default function None() {
  return (
    <>
      <div id="verify-black" style={{ color: 'black' }}>
        This text should be black.
      </div>
      <br />
      <Link href="/red" prefetch={false}>
        <a id="link-red">Red</a>
      </Link>
      <br />
      <Link href="/blue" prefetch={false}>
        <a id="link-blue">Blue</a>
      </Link>
    </>
  )
}
