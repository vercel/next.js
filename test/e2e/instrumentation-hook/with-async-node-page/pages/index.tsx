export default function Page({ finished }) {
  return <h1>{`Page Node instrumentationFinished=${finished}`}</h1>
}

export async function getServerSideProps() {
  return {
    props: {
      finished: globalThis.instrumentationFinished,
    },
  }
}
