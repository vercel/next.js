export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export default function Page() {
  return (
    <>
      <p>/edge-pages</p>
      <p>now: {Date.now()}</p>
    </>
  )
}
