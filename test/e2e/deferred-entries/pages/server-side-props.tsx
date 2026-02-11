type ServerSidePropsPageProps = {
  timestamp: number
}

export function getServerSideProps() {
  return {
    props: {
      timestamp: Date.now(),
    },
  }
}

export default function ServerSidePropsPage({
  timestamp,
}: ServerSidePropsPageProps) {
  return (
    <div>
      <h1>Pages getServerSideProps</h1>
      <p id="server-side-timestamp">{timestamp}</p>
    </div>
  )
}
