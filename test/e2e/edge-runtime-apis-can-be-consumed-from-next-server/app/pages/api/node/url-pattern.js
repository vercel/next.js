import { urlPatternTest } from '../../../src/url-pattern'

export default (req, res) => {
  res.json(urlPatternTest(req))
}
