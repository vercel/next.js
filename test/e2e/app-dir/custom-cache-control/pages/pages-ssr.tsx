export function getServerSideProps() {
  return {
    props: {
      now: Date.now(),
    },
  }
}

export default function Page() {
  return (
    <>
      <p>/pages-ssr</p>
    </>
  )
}
