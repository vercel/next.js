export default function Page() {
  return <div>bar</div>
}

export async function getServerSideProps() {
  return {
    props: {
      data: {},
    },
  }
}
