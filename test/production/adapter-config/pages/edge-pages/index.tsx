export const config = {
  runtime: 'experimental-edge',
  maxDuration: 60,
}

export default function Page() {
  return (
    <>
      <p>/edge-pages</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
