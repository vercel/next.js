/**
 * API route that returns all request headers as JSON.
 * Used to verify header handling WITHOUT middleware.
 */
export default function handler(req, res) {
  res.status(200).json(req.headers)
}
