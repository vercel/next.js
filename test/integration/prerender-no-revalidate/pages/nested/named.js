let runs = 0

export async function getStaticProps() {
  if (runs++) {
    throw new Error('GSP was re-run.')
  }

  return {
    props: {
      world: 'world',
      time: new Date().getTime(),
      other: Math.random(),
    },
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
