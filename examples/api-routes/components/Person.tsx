import Link from 'next/link'
import { Person } from '../interfaces'

type PersonProps = {
  person: Person
}

const PersonComponent = ({ person }: PersonProps) => {
  return (
    <li>
      <Link href="/person/[id]" as={`/person/${person.id}`}>
        <a>{person.name}</a>
      </Link>
    </li>
  )
}

export default PersonComponent
