export async function getServerSideProps() {
  return {
    props: {
      url: 'something',
    },
  }
}

export default ({ url }) => <p>url: {url}</p>
