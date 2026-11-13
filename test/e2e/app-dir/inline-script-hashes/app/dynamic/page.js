export const dynamic = 'force-dynamic'

export default function Page() {
  return <p id="dynamic">{Date.now()}</p>
}
