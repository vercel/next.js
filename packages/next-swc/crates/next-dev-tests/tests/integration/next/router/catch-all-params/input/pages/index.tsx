export function getServerSideProps() {
  return {
    redirect: {
      destination: '/first/second',
    },
  }
}
