import { people } from '../../../data'

export default (req, res) => {
  if (req.method === 'POST') {
    if (req.headers['content-type'].startsWith('application/json')) {
      // req.body will be automatically parsed to JSON when the request's Content-Type is `application/json`
      res.json(req.body)
    } else {
      res.send(req.body)
    }
  } else {
    res.status(200).json(people)
  }
}
