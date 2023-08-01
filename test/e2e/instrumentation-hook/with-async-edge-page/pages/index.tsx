export default function Page({ finished }) {
  return <p>{`Edge - finished: ${finished}`}</p>
}

export function getServerSideProps() {
  return {
    props: {
      finished: Boolean(globalThis.instrumentationFinished),
    },
  }
}

export const config = {
  runtime: 'experimental-edge',
}
