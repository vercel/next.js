export default function Page({ finished }) {
  return <p>{`Node - finished: ${finished}`}</p>
}

export async function getServerSideProps() {
  return {
    props: {
      finished: Boolean(globalThis.instrumentationFinished),
    },
  }
}
