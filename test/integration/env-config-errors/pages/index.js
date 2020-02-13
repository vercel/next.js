// eslint-disable-next-line camelcase
export async function unstable_getStaticProps({ env }) {
  return {
    // Do not pass any sensitive values here as they will
    // be made PUBLICLY available in `pageProps`
    props: { env },
    revalidate: 1,
  }
}

export default ({ env }) => <p>{JSON.stringify(env)}</p>
