const value = await Promise.resolve(42)

export default function (req, res) {
  res.json({ value })
}
