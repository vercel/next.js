import Link from 'next/link'

export async function getServerSideProps({ query }) {
  return {
    props: { href: query.href || '/' },
  }
}

export default function Linker({ href }) {
  return (
    <div>
      <Link href={href}>
        <a id="link">link to {href}</a>
      </Link>
    </div>
  )
}
