export default async (req, res) => {
  res.status(200).json({
    payload: `isOdd: ${globalThis.isOdd(3)}`,
  })
}
