import Link from 'next/link'
export default function Page() {
  return (
    <>
      <h1>Onclick prevent default</h1>
      <Link
        href="/"
        oldBehavior={false}
        onClick={(e) => {
          e.preventDefault()
          console.log('link to home clicked but prevented')
        }}
      >
        Home
      </Link>
    </>
  )
}
