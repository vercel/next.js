export default async function DynamicPage() {
  const { readCookie } = await import('./read-cookie')

  return <p id="value">{await readCookie()}</p>
}
