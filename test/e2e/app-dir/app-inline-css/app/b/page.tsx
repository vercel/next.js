import '../global.css' // duplicate global.css to test it's consolidated by React Float

export const dynamic = 'force-dynamic'

export default function Page() {
  return (
    <div className="page" id="page-b">
      Page B
    </div>
  )
}
