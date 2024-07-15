import Link from 'next/link'
export default function Page() {
  return (
    <Link
      href="/"
      onMouseDown={() => {
        console.log('link to home pressed down')
      }}
    >
      Home
    </Link>
  )
}
