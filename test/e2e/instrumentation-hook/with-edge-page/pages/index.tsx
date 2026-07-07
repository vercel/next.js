export default function Page() {
  return (
    <h1>
      {`Page Edge instrumentationFinished=${(globalThis as any).instrumentationFinished}`}
    </h1>
  )
}

// force dynamic rendering
export async function getServerSideProps() {
  return { props: {} }
}

export const config = {
  runtime: 'experimental-edge',
}
