export async function Optimistic({ searchParams }) {
  try {
    return <div id="foosearch">foo search: {(await searchParams).foo}</div>
  } catch (err) {
    return <div id="foosearch">foo search: optimistic</div>
  }
}
