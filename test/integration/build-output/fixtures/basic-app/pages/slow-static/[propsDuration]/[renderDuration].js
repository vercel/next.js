export default ({ renderDuration }) => {
  const target = Date.now() + (+renderDuration || 200)
  while (Date.now() < target);
  return <div>{renderDuration}</div>
}

export function getStaticPaths() {
  return {
    paths: [
      [2000, 10],
      [5, 5],
      [25, 25],
      [20, 20],
      [10, 10],
      [15, 15],
      [15, 10],
      [10, 10],
      [300, 10],
      [10, 1000],
    ].map(([propsDuration, renderDuration]) => ({
      params: {
        renderDuration: `${renderDuration}`,
        propsDuration: `${propsDuration}`,
      },
    })),
    fallback: true,
  }
}

export async function getStaticProps({ params }) {
  const { renderDuration, propsDuration } = params
  await new Promise((r) => setTimeout(r, +propsDuration))
  return { props: { renderDuration } }
}
