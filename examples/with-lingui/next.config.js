const { locales, sourceLocale } = require("./lingui.config.js");

/** @type {import('next').NextConfig} */
module.exports = {
  i18n: {
    locales,
    defaultLocale: sourceLocale,
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.po/,
      use: ["@lingui/loader"],
    });

    return config;
  },
};
