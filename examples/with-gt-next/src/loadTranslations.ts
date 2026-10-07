export default async function loadTranslations(locale: string) {
    const t = await import(`../public/locales/${locale}.json`);
    return t.default;
  }