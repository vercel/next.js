import { Client } from 'faunadb'

export default (_req, res) => {
  const client = new Client({ secret: 'foobar' })
  console.log(client)
  res.send({ message: 'hello world' })
}
