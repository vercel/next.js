import { MetadataRoute } from "next";
import fs from "fs";
import path from "path";
import config from "../../richtpl.config";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result: MetadataRoute.Sitemap = [];

  for (const lang of config.i18n.locales) {
    const langConfig = config.i18n.localeConfigs[lang];
    const homeUrl = `${config.url}/${langConfig.path}`;

    result.push({
      url: homeUrl,
      lastModified: new Date().toISOString(),
      changeFrequency: "daily",
      priority: 1.0,
      alternates: {
        languages: config.i18n.locales.reduce<{ [key: string]: string }>(
          (acc, l) => {
            const langConfig = config.i18n.localeConfigs[l];
            acc[langConfig.htmlLang] = `${config.url}/${langConfig.path}`;
            return acc;
          },
          {},
        ),
      },
    });

    const dirPath = path.join(process.cwd(), `src/app/[locale]`);

    if (fs.existsSync(dirPath)) {
      const items = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const item of items) {
        if (
          item.isDirectory() &&
          !config.themeConfig.sitemap?.excludedDirs?.includes(item.name)
        ) {
          const pagePath = path.join(dirPath, item.name, "page.tsx");
          if (fs.existsSync(pagePath)) {
            const url = `${config.url}/${langConfig.path}/${item.name}`;

            result.push({
              url: url,
              lastModified: new Date().toISOString(),
              changeFrequency: "daily",
              priority: 0.7,
              alternates: {
                languages: config.i18n.locales.reduce<{
                  [key: string]: string;
                }>((acc, l) => {
                  const langConfig = config.i18n.localeConfigs[l];
                  acc[langConfig.htmlLang] =
                    `${config.url}/${langConfig.path}/${item.name}`;
                  return acc;
                }, {}),
              },
            });
          }
        }
      }
    }
  }

  return result;
}
