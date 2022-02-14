export default async function handler(req, res) {
  const response = await fetch('https://api.github.com/repos/vercel/next.js')
  const repo = await response.json()

  return res.json(repo)
}
