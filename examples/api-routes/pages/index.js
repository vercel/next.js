import Person from '../components/Person'
import fetch from 'node-fetch'

const Index = ({ people }) => (
  <ul>
    {people.map((p, i) => (
      <Person key={i} person={p} />
    ))}
  </ul>
)

export async function getServerSideProps() {
  const response = await fetch('http://localhost:3000/api/people')
  const people = await response.json()

  return { props: { people } }
}

export default Index
