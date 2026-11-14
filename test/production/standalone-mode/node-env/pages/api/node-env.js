export default function handler(req, res) {
  // MY_MARKER comes from .env.production / .env.test, which are loaded at
  // runtime based on NODE_ENV. process.env.NODE_ENV itself is inlined into
  // the server bundles at build time, so the env file selection is the
  // observable runtime behavior.
  res.status(200).json({ marker: process.env.MY_MARKER ?? null })
}
