export default function Page() {
  return 'Hello world'
}

export function getStaticProps() {
  return { notFound: true }
}
