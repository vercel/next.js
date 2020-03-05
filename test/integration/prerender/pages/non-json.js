export async function getStaticProps() {
  return {
    props: { time: new Date() },
  }
}

const Page = ({ time }) => {
  return <p>hello {time}</p>
}

export default Page
