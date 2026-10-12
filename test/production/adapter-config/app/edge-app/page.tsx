export const runtime = 'edge'
export const maxDuration = 20

export default function Page() {
  return (
    <>
      <p>/edge-app</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
