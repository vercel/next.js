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

export default ({ world }) => <p>Hello {world}</p>
