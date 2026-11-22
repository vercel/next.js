export const runtime = 'edge'
export const preferredRegion = 'sfo1'

export default function GlobalNotFound() {
  return (
    <html>
      <body>
        <p id="runtime">{process.env.NEXT_RUNTIME}</p>
      </body>
    </html>
  )
}
