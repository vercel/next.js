function Page({ date }) {
  return (
    <>
      <h1>$$</h1>
      <p>Date: {date}</p>
    </>
  )
}

export async function getStaticProps() {
  return {
    props: {
      date: new Date().toISOString(),
      page: '$$',
    },
  }
}

export default Page
