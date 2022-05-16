export async function getStaticProps() {
  return {
    redirect: {
      destination: '/en/home',
      permanent: false,
    },
  }
}

export async function getStaticPaths() {
  return { paths: [], fallback: 'blocking' }
}

export default function Component() {
  return 'gsp-blocking-redirect'
}
