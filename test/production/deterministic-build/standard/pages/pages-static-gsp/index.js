export default function Page() {
  return 'pages-static-props'
}

export async function getStaticProps() {
  return { props: { foo: 123 } }
}
