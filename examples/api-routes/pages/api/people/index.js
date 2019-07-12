import { people } from '../../../data'

export default (req, res) => {
  if (req.method === 'POST') {
    if (req.headers['content-type'].startsWith('application/json')) {
      // req.body will be automatically parsed to JSON when the request's Content-Type is `application/json`
      res.send('The data you sent has been interpreted as application/json.')
    } else {
      res
        .status(400)
        .send(
          'Please POST JSON and use Content-Type="application/json" in your HTTP headers.'
        )
    }
  } else {
    res.status(200).json(people)
  }
}
