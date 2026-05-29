export async function getServerSideProps() {
  return {
    props: {
      idk: 'oops',
    },
  }
}

export default () => 'hi'
