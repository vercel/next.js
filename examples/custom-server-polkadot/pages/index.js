import Link from 'next/link'

export async function getServerSideProps() {
  const response = await fetch('http://localhost:3000/api/links')
  const links = await response.json()

  return {
    props: {
      links,
    },
  }
}

export default function Home({ links }) {
  return (
    <ul>
      {links.map(({ href, as, value }) => (
        <li>
          <Link href={href} as={as}>
            <a>{value}</a>
          </Link>
        </li>
      ))}
    </ul>
  )
}
