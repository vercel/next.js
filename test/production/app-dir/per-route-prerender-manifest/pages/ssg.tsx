export function getStaticProps() {
  return { props: {}, revalidate: 10 }
}

export default function Page() {
  return <p>pages ssg page</p>
}
