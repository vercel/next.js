require('dotenv').config()

module.exports = {
  env: {
    NEXT_EXAMPLE_CMS_PRISMIC_API_TOKEN:
      process.env.NEXT_EXAMPLE_CMS_PRISMIC_API_TOKEN,
    NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_NAME:
      process.env.NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_NAME,
  },
}
