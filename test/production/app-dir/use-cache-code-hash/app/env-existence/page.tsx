async function logic() {
  'use cache'
  if (!process.env.FOO || !process.env.BAR) {
    return true
  }
  return false
}

export default async function Page() {
  const value = await logic()
  return <p>{value}</p>
}
