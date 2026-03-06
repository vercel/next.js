export const runtime = 'edge'
export const markdown = true

export default function Page() {
  return (
    <>
      <p>/edge-app</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
