export default function handler(_req, res) {
  res.json({ deploymentId: process.env.NEXT_DEPLOYMENT_ID })
}
