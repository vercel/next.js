export async function getStaticProps() {
  return {
    props: {
      time: new Date().getTime(),
    },
    revalidate: 10,
  }
}

export default function ISGCustomHeaderPage({ time }) {
  return (
    <div>
      <p>ISG Custom Header Page</p>
      <span>time: {time}</span>
    </div>
  )
}
