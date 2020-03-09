export async function getServerSideProps() {
  return {
    props: { time: new Date() },
  }
}

const Page = ({ time }) => {
  return <p>hello {time.toString()}</p>
}

export default Page
