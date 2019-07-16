import fetch from 'isomorphic-unfetch'

const Person = ({ data, status }) =>
  status === 200 ? (
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Height</th>
          <th>Mass</th>
          <th>Hair color</th>
          <th>Skin color</th>
          <th>Eye color</th>
          <th>Gender</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>{data.name}</td>
          <td>{data.height}</td>
          <td>{data.mass}</td>
          <td>{data.hair_color}</td>
          <td>{data.skin_color}</td>
          <td>{data.eye_color}</td>
          <td>{data.gender}</td>
        </tr>
      </tbody>
    </table>
  ) : (
    <p>{data.message}</p>
  )

Person.getInitialProps = async ({ query }) => {
  const response = await fetch(`http://localhost:3000/api/people/${query.id}`)

  const data = await response.json()
  return { data, status: response.status }
}

export default Person
