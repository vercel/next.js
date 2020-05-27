export async function getServerSideProps() {
  return {
    props: {},
    redirect: '/normal',
  }
}

export default () => 'redirect'
