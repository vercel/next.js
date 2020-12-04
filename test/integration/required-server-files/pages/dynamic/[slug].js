export const getServerSideProps = ({ params }) => {
  return {
    props: {
      hello: 'world',
      slug: params.slug,
      random: Math.random(),
    },
  }
}

export default function Page(props) {
  return (
    <>
      <p id="dynamic">dynamic page</p>
      <p id="slug">{props.slug}</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}
