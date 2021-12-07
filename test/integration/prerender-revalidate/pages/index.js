export async function getStaticProps() {
  return {
    props: {
      world: 'world',
      time: new Date().getTime(),
      other: Math.random(),
    },
    revalidate: 1,
  }
}

const Page = ({ world, time, other }) => {
  return (
    <div>
      <p>hello {world}</p>
      <span>time: {time}</span>
      <span>other: {other}</span>
    </div>
  )
}

export default Page
