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

export default async (req, res) => {
  // Only for testing, don't do this...
  res.json(req.env)
}
