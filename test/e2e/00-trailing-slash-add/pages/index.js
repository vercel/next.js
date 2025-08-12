export function getStaticProps() {
  return {
    props: {
      now: Date.now(),
    },
    revalidate: 1,
  }
}

export default function Page() {
  return (
    <>
      <p>index page</p>
    </>
  )
}
