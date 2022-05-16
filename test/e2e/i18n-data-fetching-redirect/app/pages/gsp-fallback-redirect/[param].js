export async function getStaticProps() {
  return {
    redirect: {
      destination: '/en/home',
      permanent: false,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: true }
}

export default function Component() {
  return 'gsp-fallback-redirect'
}
