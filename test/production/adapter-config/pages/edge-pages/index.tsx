export const config = {
  runtime: 'experimental-edge',
}

export default function Page() {
  return (
    <>
      <p>/edge-pages</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
