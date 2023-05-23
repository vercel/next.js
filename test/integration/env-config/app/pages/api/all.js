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

export default async function handler(req, res) {
  const items = {
    nextConfigEnv: process.env.nextConfigEnv,
    nextConfigPublicEnv: process.env.nextConfigPublicEnv,
    nextConfigNewPublicEnv: process.env.NEXT_PUBLIC_NEW_NEXT_CONFIG_VALUE,
  }

  variables.forEach((variable) => {
    items[variable] = process.env[variable]
  })

  // Only for testing, don't do this...
  res.json(items)
}
