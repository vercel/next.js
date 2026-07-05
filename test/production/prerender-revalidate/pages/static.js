export async function getStaticProps() {
  return {
    props: {
      world: 'world',
    },
    revalidate: 10,
  }
}

const Page = ({ world }) => {
  return (
    <div>
      <p>hello {world}</p>
    </div>
  )
}

export default Page
