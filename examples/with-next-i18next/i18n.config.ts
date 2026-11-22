import type { I18nConfig } from "next-i18next/proxy";

const i18nConfig: I18nConfig = {
  supportedLngs: ["en", "de"],
  fallbackLng: "en",
  defaultNS: "common",
  ns: ["common"],
  // Bundler-traceable dynamic import, so translation files are included in
  // serverless deployments (Vercel etc.). See the next-i18next README for a
  // variant with full hot-reloading of translation files in development.
  resourceLoader: (language, namespace) =>
    import(`./app/i18n/locales/${language}/${namespace}.json`),
};

export default i18nConfig;
