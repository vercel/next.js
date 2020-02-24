export const config = {
  env: [
    'ENV_FILE_KEY',
    'LOCAL_ENV_FILE_KEY',
    'PRODUCTION_ENV_FILE_KEY',
    'LOCAL_PRODUCTION_ENV_FILE_KEY',
    'DEVELOPMENT_ENV_FILE_KEY',
    'LOCAL_DEVELOPMENT_ENV_FILE_KEY',
  ],
}

// eslint-disable-next-line camelcase
export async function unstable_getServerProps({ env }) {
  return {
    // Do not pass any sensitive values here as they will
    // be made PUBLICLY available in `pageProps`
    props: { env },
  }
}

export default ({ env }) => <p>{JSON.stringify(env)}</p>
