export async function getStaticProps() {
  return {
    props: { time: new Date() },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: true }
}

const Page = ({ time }) => {
  return <p>hello {time}</p>
}

export default Page
