export default function handler(_, res) {
  res.json({
    env: process.env.FOO,
    envLocal: process.env.LOCAL_SECRET,
    envProd: process.env.PROD_SECRET,
    envFromHost: process.env.ENV_FROM_HOST,
  })
}
