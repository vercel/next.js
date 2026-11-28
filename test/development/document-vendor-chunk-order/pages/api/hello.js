import depA from 'dep-a'

export default function handler(req, res) {
  res.json({ dep: depA })
}
