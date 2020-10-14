const gsspValue = await Promise.resolve(42)

export async function getServerSideProps() {
  return {
    props: { gsspValue },
  }
}

export default function Index({ gsspValue }) {
  return (
    <main>
      <div id="gssp-value">{gsspValue}</div>
    </main>
  )
}
