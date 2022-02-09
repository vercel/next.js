export default function handler(_, res) {
  res.send(process.env.FOO)
}
