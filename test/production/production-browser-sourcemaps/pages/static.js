export default function StaticPage({ data }) {
  return <div>{data.foo}</div>
}

export async function getStaticProps() {
  return {
    props: {
      data: {
        foo: 'bar',
      },
    },
  }
}
