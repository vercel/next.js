export default function SSG({ timestamp }) {
  return (
    <div>
      <h1>SSG Page</h1>
      <p id="timestamp">Generated at: {timestamp}</p>
    </div>
  )
}

export function getStaticProps() {
  return {
    props: {
      timestamp: Date.now(),
    },
  }
}
