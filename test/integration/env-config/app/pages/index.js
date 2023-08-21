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
  'NEW_ENV_KEY',
  'NEW_ENV_LOCAL_KEY',
  'NEW_ENV_DEV_KEY',
  'NEXT_PUBLIC_HELLO_WORLD',
]

export async function getStaticProps() {
  const items = {}

  variables.forEach((variable) => {
    if (process.env[variable]) {
      items[variable] = process.env[variable]
    }
  })

  return {
    // Do not pass any sensitive values here as they will
    // be made PUBLICLY available in `pageProps`
    props: { env: items },
    revalidate: 1,
  }
}

export default function Page({ env }) {
  return (
    <>
      <p>{JSON.stringify(env)}</p>
      <div id="nextConfigEnv">{process.env.nextConfigEnv}</div>
      <div id="nextConfigPublicEnv">{process.env.nextConfigPublicEnv}</div>
      <div id="nextConfigNewPublicEnv">
        {process.env.NEXT_PUBLIC_NEW_NEXT_CONFIG_VALUE}
      </div>
    </>
  )
}
