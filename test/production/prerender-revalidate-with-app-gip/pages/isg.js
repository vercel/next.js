export async function getStaticProps() {
  return {
    props: {
      time: new Date().getTime(),
    },
    revalidate: 10,
  }
}

export default function ISGPage({ time }) {
  return (
    <div>
      <p>ISG Page</p>
      <span>time: {time}</span>
    </div>
  )
}
