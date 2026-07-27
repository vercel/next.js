export const LONG_RUNNING_MS = 400

export default async (req, res) => {
  await new Promise((resolve) => setTimeout(resolve, LONG_RUNNING_MS))
  res.json({ hello: 'world' })
}
