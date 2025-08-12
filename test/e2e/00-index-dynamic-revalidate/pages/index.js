export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
      random: Math.random() + Date.now(),
      page: 'index',
    },
    revalidate: 1,
  }
}

export default function Page(props) {
  return (
    <>
      <p>index page {JSON.stringify(props)}</p>
    </>
  )
}
