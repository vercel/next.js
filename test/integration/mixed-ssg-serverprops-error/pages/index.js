export const getStaticProps = async () => {
  return {
    props: { world: 'world' },
  }
}

export const getServerSideProps = async () => {
  return {
    props: { world: 'world' },
  }
}

const Index = ({ world }) => <p>Hello {world}</p>

export default Index
