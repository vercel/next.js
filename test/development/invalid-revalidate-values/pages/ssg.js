export default function Page() {
  return (
    <>
      <p>a-ok</p>
    </>
  )
}

export const getStaticProps = () => {
  return {
    props: {
      hello: 'world',
    },
    revalidate: 1,
  }
}
