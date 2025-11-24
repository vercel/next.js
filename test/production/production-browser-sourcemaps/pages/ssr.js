export default function SSRPage({ data }) {
  return <div>{data.foo}</div>
}

export async function getServerSideProps() {
  return {
    props: {
      data: {
        foo: 'bar',
      },
    },
  }
}
