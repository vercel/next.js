export const fetchCache = 'force-no-store'

export default async function Page() {
  const response = await fetch('data:text/plain,slot')
  return <p id="slot">{await response.text()}</p>
}
