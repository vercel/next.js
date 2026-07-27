export default function Page() {
  return (
    <h1>
      {`Page instrumentationFinished=${(globalThis as any).instrumentationFinished}`}
    </h1>
  )
}

// force dynamic rendering
export async function getServerSideProps() {
  return { props: {} }
}
