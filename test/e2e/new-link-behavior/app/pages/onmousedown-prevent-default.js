import Link from 'next/link'
export default function Page() {
  return (
    <>
      <h1>onMouseDown prevent default</h1>
      <Link
        href="/"
        onMouseDown={(e) => {
          e.preventDefault()
          console.log('link to home pressed down but prevented')
        }}
      >
        Home
      </Link>
    </>
  )
}
