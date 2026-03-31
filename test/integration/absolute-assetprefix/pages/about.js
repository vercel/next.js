export async function getStaticProps() {
  return { props: { prop: 'hello' } }
}

export default function About({ prop }) {
  return (
    <>
      about <div id="prop">{prop}</div>
    </>
  )
}
