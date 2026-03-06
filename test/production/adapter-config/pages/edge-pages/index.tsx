export const config = {
  runtime: 'experimental-edge',
}
export const markdown = true

export default function Page() {
  return (
    <>
      <p>/edge-pages</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
