export default function handler(req, res) {
  return res.send(req.query.word);
}
