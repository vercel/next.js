import Link from 'next/link'
export default function Page1() {
  return (
    <>
      <div className="red-text">This text should be red.</div>
      <br />
      <input key={'' + Math.random()} id="text-input" type="text" />
      <br />
      <Link href="/page2">
        <a>Switch page</a>
      </Link>
    </>
  )
}
