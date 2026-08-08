import Link from 'next/link'

export default function None() {
  return (
    <>
      <div id="verify-black" style={{ color: 'black' }}>
        This text should be black.
      </div>
      <br />
      <Link href="/red" prefetch={false} id="link-red">
        Red
      </Link>
      <br />
      <Link href="/blue" prefetch={false} id="link-blue">
        Blue
      </Link>
    </>
  )
}
