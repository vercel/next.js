export default function SSRPage(props) {
  return <h1>{props.message}</h1>
}

export const getServerSideProps = (req) => {
  return {
    props: {
      message: 'Hello World',
    },
  }
}
