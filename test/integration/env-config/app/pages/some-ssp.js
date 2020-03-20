export const config = {
  env: [
    'PROCESS_ENV_KEY',
    'ENV_FILE_KEY',
    'LOCAL_ENV_FILE_KEY',
    'ENV_FILE_LOCAL_OVERRIDE_TEST',
    'PRODUCTION_ENV_FILE_KEY',
    'LOCAL_PRODUCTION_ENV_FILE_KEY',
    'DEVELOPMENT_ENV_FILE_KEY',
    'LOCAL_DEVELOPMENT_ENV_FILE_KEY',
    'ENV_FILE_DEVELOPMENT_OVERRIDE_TEST',
    'ENV_FILE_DEVELOPMENT_LOCAL_OVERRIDEOVERRIDE_TEST',
    'ENV_FILE_PRODUCTION_OVERRIDEOVERRIDE_TEST',
    'ENV_FILE_PRODUCTION_LOCAL_OVERRIDEOVERRIDE_TEST',
    'TEST_ENV_FILE_KEY',
    'LOCAL_TEST_ENV_FILE_KEY',
    'ENV_FILE_TEST_OVERRIDE_TEST',
    'ENV_FILE_TEST_LOCAL_OVERRIDEOVERRIDE_TEST',
  ],
}

export async function getServerSideProps({ env }) {
  return {
    // Do not pass any sensitive values here as they will
    // be made PUBLICLY available in `pageProps`
    props: { env },
  }
}

export default ({ env }) => <p>{JSON.stringify(env)}</p>
