function Page({ date }) {
  return (
    <>
      <h1>b$$</h1>
      <p>Date: {date}</p>
    </>
  )
}

export async function getStaticProps() {
  return {
    props: {
      date: new Date().toISOString(),
      page: 'b$$',
    },
    revalidate: 5,
  }
}

export default Page
