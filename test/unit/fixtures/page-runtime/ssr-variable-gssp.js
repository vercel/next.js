export default function Nodejs() {
  return 'nodejs'
}

// export an identifier instead of function
export const getServerSideProps = async () => {
  return { props: {} }
}

export const config = {
  runtime: 'experimental-edge',
}
