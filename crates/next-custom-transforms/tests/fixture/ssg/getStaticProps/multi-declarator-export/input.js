export const a = 1,
  b = 2

export async function getStaticProps() {
  return {
    props: {
      sum: a + b,
    },
  }
}

export default function Page() {
  return <div>Test</div>
}
