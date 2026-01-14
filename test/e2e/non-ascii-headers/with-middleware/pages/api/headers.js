/**
 * API route that returns all request headers as JSON.
 * Used to verify middleware header handling.
 */
export default function handler(req, res) {
  res.status(200).json(req.headers)
}
