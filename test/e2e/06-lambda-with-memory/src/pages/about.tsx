export default function (props) {
  return `${props.memorySize}`
}

export async function getServerSideProps() {
  return {
    props: {
      memorySize: process.env.AWS_LAMBDA_FUNCTION_MEMORY_SIZE,
    },
  }
}
