export default function Page(props) {
  return (
    <>
      <p id="not-found">404 page</p>
      <p id="props">{JSON.stringify(props)}</p>
    </>
  )
}

export const getStaticProps = () => {
  console.log('404 getStaticProps')
  return {
    props: {
      notFound: true,
      random: Math.random(),
    },
    revalidate: 6000,
  }
}
