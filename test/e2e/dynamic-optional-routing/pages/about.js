export default function Page(props) {
  return <div id="content">about</div>
}

export const getServerSideProps = () => {
  return {
    props: {},
  }
}
