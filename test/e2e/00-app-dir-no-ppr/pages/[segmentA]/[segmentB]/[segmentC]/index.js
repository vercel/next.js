export default function Page(props) {
  return <div>SSRed Page</div>
}

export async function getServerSideProps() {
  return {
    props: {},
  }
}
