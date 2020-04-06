import Link from 'next/link'

export default ({ person }) => (
  <li>
    <Link href="/person/[id]" as={`/person/${person.id}`}>
      <a>{person.name}</a>
    </Link>
  </li>
)
