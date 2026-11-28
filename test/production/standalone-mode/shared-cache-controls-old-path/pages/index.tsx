export default function Page() {
  return <p>hello world</p>
}

export function getStaticProps() {
  return { props: {}, revalidate: 60 }
}
