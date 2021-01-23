const variables = [
  'PROCESS_ENV_KEY',
  'ENV_FILE_KEY',
  'ENV_FILE_EMPTY_FIRST',
  'ENV_FILE_PROCESS_ENV',
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
  'ENV_FILE_EXPANDED',
  'ENV_FILE_EXPANDED_CONCAT',
  'ENV_FILE_EXPANDED_ESCAPED',
  'ENV_FILE_KEY_EXCLAMATION',
]

export async function getServerSideProps() {
  const items = {}

  variables.forEach((variable) => {
    if (typeof process.env[variable] !== 'undefined') {
      items[variable] = process.env[variable]
    }
  })

  return {
    // Do not pass any sensitive values here as they will
    // be made PUBLICLY available in `pageProps`
    props: { env: items },
  }
}

export default ({ env }) => <p>{JSON.stringify(env)}</p>
