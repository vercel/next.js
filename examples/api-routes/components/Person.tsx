import Link from 'next/link'
import { Person } from '../interfaces'

type PersonProps = {
  person: Person
}

export default function PersonComponent({ person }: PersonProps) {
  return (
    <li>
      <Link href="/person/[id]" as={`/person/${person.id}`}>
        {person.name}
      </Link>
    </li>
  )
}
