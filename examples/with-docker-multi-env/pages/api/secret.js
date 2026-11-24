// Server-only values are read at request time, so they are set when the
// container starts instead of being baked into the image.
export default function handler(req, res) {
  res.status(200).json({ configured: Boolean(process.env.API_SECRET) });
}
