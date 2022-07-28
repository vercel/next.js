import { processRequest } from '../../utils/processRequest'

export default (req) => {
  return processRequest(req)
  //return new Response(`Returned by Edge API Route ${req.url}`)
}

export const config = {
  runtime: `experimental-edge`,
}
