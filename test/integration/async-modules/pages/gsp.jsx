const gspValue = await Promise.resolve(42)

export async function getStaticProps() {
  return {
    props: { gspValue },
  }
}

export default function Index({ gspValue }) {
  return (
    <main>
      <div id="gsp-value">{gspValue}</div>
    </main>
  )
}
