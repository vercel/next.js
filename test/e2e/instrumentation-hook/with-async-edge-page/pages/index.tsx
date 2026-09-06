export default function Page({ finished }) {
  return <h1>{`Page Edge instrumentationFinished=${finished}`}</h1>
}

export function getServerSideProps() {
  return {
    props: {
      finished: globalThis.instrumentationFinished,
    },
  }
}

export const config = {
  runtime: 'experimental-edge',
}
