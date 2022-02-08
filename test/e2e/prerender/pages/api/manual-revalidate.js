export default async function handler(req, res) {
  // WARNING: don't use user input in production
  // make sure to use trusted value for revalidating
  const revalidateRes = await res.unstable_revalidate(req.query.pathname)
  res.json({
    revalidated: true,
    status: revalidateRes.status,
    text: await revalidateRes.text(),
  })
}
