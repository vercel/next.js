const Page = () => "I'm SSRed"

export async function getStaticProps() {
  return {
    props: {
      hello: 'world',
    },
  }
}

export default Page
