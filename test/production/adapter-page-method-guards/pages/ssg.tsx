export async function getStaticProps() {
  return { props: {}, revalidate: 60 }
}

export default function Page() {
  return <p>pages ssg page</p>
}
