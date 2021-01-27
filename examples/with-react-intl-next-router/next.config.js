// scripts
const withReactIntlNoParser = require('./plugins/withReactIntlNoParser');

module.exports = withReactIntlNoParser()({
  i18n: {
    locales: process.env.SUPPORTED_LOCALES.split(/, ?/),
    defaultLocale: process.env.DEFAULT_LOCALE,
  },
});
