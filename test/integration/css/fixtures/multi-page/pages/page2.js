import Link from 'next/link'
export default function Page2 () {
  return (
    <>
      <div className='blue-text'>This text should be blue.</div>
      <br />
      <input key={'' + Math.random()} id='text-input' type='text' />
      <br />
      <Link href='/page1'>
        <a>Switch page</a>
      </Link>
    </>
  )
}
