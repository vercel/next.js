const Error = ({ message }) => {
  return <p id="error-p">Error Rendered with: {message}</p>
}

export function getServerSideProps() {
  return {
    props: {
      message: '_error server side props data',
    },
  }
}

export default Error
