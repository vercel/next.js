import Link from 'next/link'

export default function Other() {
  return (
    <>
      <h1 id="other">Other</h1>
      <Link href="/nodejs" id="to-nodejs">
        /nodejs
      </Link>
      <Link href="/edge" id="to-edge">
        /edge
      </Link>
    </>
  )
}

export function getServerSideProps() {
  return { props: {} }
}
