export default function Page() {
  return <p>hello world</p>
}

export async function getStaticProps() {
  return { props: {}, revalidate: 300 }
}
