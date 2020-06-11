require('dotenv').config()

module.exports = {
  env: {
    PRISMIC_API_TOKEN: process.env.PRISMIC_API_TOKEN,
    PRISMIC_REPOSITORY_NAME: process.env.PRISMIC_REPOSITORY_NAME,
    NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_LOCALE:
      process.env.NEXT_EXAMPLE_CMS_PRISMIC_REPOSITORY_LOCALE || 'en-us',
  },
}
