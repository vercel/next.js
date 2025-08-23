export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p>/node-pages</p>
      <p>hello world</p>
      <p>now: {Date.now()}</p>
      <p>{JSON.stringify(props)}</p>
    </>
  )
}
