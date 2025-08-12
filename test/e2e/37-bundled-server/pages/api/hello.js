export default async (req, res) => {
  res.status(200).json({
    payload: `hello world from api`,
  })
}
