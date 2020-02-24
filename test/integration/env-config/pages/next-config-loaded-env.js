export default () => (
  <p>
    {JSON.stringify({
      APP_TITLE: process.env.TEST_ENV_LOADING_IN_NEXT_CONFIG_APP_TITLE,
    })}
  </p>
)
