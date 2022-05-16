export async function getServerSideProps() {
  return {
    redirect: {
      destination: '/en/home',
      permanent: false,
    },
  }
}

export default function Component() {
  return 'gssp-redirect'
}
