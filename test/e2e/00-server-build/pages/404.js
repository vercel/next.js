export default function Page(props) {
  return (
    <>
      <p>custom 404</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export function getStaticProps() {
  console.log('pages/404 getStaticProps')
  return {
    props: {
      is404: true,
      time: Date.now(),
    },
  }
}
