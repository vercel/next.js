export function getServerSideProps() {
  return {
    redirect: {
      destination: '/dynamic-segment',
    },
  }
}
