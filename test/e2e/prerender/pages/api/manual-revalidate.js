export default async function handler(req, res) {
  // WARNING: don't use user input in production
  // make sure to use trusted value for revalidating
  let revalidated = false
  try {
    await res.revalidate(req.query.pathname, {
      unstable_onlyGenerated: !!req.query.onlyGenerated,
    })
    revalidated = true
  } catch (err) {
    console.error(err)
  }
  res.json({
    revalidated,
  })
}
