// Health check endpoint for container orchestration (Docker, Kubernetes, etc.)
// https://nextjs.org/docs/api-routes/introduction

export default function health(req, res) {
  res.status(200).json({ status: "ok" });
}
