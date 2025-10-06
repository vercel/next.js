export const runtime = 'edge'
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default function Page() {
  return (
    <div>
      This page uses `export const runtime`, `export const dynamic`, and `export
      const fetchCache`.
    </div>
  )
}
