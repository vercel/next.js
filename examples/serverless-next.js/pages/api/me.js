export default async function handler(req, res) {
  const response = await fetch('https://api.ipify.org?format=json')
  const responseJSON = await response.json()
  res.status(200).json(responseJSON)
}
