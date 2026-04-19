export default function Home({}) {
  return (
    <div>
      <p>Hello World</p>
    </div>
  )
}

export async function getStaticProps() {
  await import('_http_common').then((http) => console.log(http))
  return {
    props: {},
  }
}
