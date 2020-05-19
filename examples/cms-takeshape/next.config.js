require('dotenv').config()

module.exports = {
  env: {
    NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY:
      process.env.NEXT_EXAMPLE_CMS_TAKESHAPE_API_KEY,
    NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID:
      process.env.NEXT_EXAMPLE_CMS_TAKESHAPE_PROJECT_ID,
  },
}
