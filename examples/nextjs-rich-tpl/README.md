<p align="center">
  <a href="https://nextjs-rich-tpl.vercel.app/">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://assets.vercel.com/image/upload/v1662130559/nextjs/Icon_dark_background.png">
      <img src="https://assets.vercel.com/image/upload/v1662130559/nextjs/Icon_light_background.png" height="128">
    </picture>
    <h1 align="center">Next.js Rich Template</h1>
  </a>
</p>

<p align="center">
  <a aria-label="Vercel logo" href="https://vercel.com">
    <img src="https://img.shields.io/badge/MADE%20BY%20Vercel-000000.svg?style=for-the-badge&logo=Vercel&labelColor=000">
  </a>
  <a aria-label="NPM version" href="https://www.npmjs.com/package/next/">
    <img alt="NPM version" src="https://img.shields.io/npm/v/next?style=for-the-badge&label=NPM&labelColor=black">
  </a>
  <a aria-label="License" href="https://github.com/Fun117/nextjs-rich-tpl/blob/main/LICENSE.txt">
    <img alt="License" src="https://img.shields.io/github/license/Fun117/nextjs-rich-tpl?style=for-the-badge&labelColor=000000">
  </a>
</p>

<p align="center">
  <a aria-label="README - English" href="https://github.com/Fun117/nextjs-rich-tpl/blob/main/README/en.md">
    <img alt="README - English" src="https://img.shields.io/badge/English-blue?style=for-the-badge">
  </a>
  <a aria-label="README - 日本語" href="https://github.com/Fun117/nextjs-rich-tpl/blob/main/README/ja.md">
    <img alt="README - 日本語" src="https://img.shields.io/badge/日本語-blue?style=for-the-badge">
  </a>
</p>

<div align="center">
  <img alt="Release version" src="https://img.shields.io/github/v/release/fun117/nextjs-rich-tpl?style=social">
  <img alt="Commit activity" src="https://img.shields.io/github/commit-activity/t/fun117/nextjs-rich-tpl?style=social">
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/fun117/nextjs-rich-tpl?style=social">
</div>

<p align="center">
  <img alt="Desktop light image" src="https://github.com/Fun117/nextjs-rich-tpl/blob/main/public/image/upload/preview/en-light-fullscreen.png">
  <img alt="Desktop dark image" src="https://github.com/Fun117/nextjs-rich-tpl/blob/main/public/image/upload/preview/en-dark-fullscreen.png">
</p>

# Next.js Rich Template

This project provides a robust starting point for building modern web applications using Next.js. It includes pre-configured localization support, theme toggling, and various other features to streamline development.

## Key Features

- **Theme Switching**: Supports both light and dark modes using `next-themes`.
- **i18n (Internationalization)**: Multi-language support using `next-intl`.
- **Sitemap**: Automatically generated for improved SEO.
- **Responsive Design**: Built with Tailwind CSS to ensure responsiveness across devices.
- **Optimized Performance**: Leveraging modern web standards for enhanced performance.

## Getting Started

To begin using this template, follow these steps:

1. Clone the repository.
2. Install the dependencies: `npm install` or `yarn install`.
3. Start the development server: `npm run dev` or `yarn dev`.

## Project Overview

See a live preview of this template [here](https://nextjs-rich-tpl.vercel.app).

## Deploy Your Own

You can deploy the template on Vercel or preview it with StackBlitz:

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/Fun117/nextjs-rich-tpl/tree/main/examples/app/with-i18n-routing&project-name=nextjs-rich-tpl&repository-name=nextjs-rich-tpl)

## How to Use

To bootstrap the project, clone the repository:

```bash
npx create-next-app -e nextjs-rich-tpl
```

Deploy to the cloud using [Vercel](https://vercel.com/new?utm_source=github&utm_medium=readme&utm_campaign=next-example) (see the official [documentation](https://nextjs.org/docs/deployment)).

# Contributing

We welcome contributions to enhance the documentation or the project itself. Contributors will be acknowledged in this README. Please check our [GitHub repository](https://github.com/fun117/nextjs-rich-tpl) for more details on how to contribute.

# Acknowledgments

Special thanks to the Next.js community and open-source projects that inspired and supported this template.

# Contact

For questions or contributions, please reach out via the [this site](https://fun117.dev/en/contacts).

---

# Documentation

### 1. `richtpl.tsx` Setup Guide

1. **Place `richtpl.tsx` at the root of your project**

Place the template configuration file `richtpl.tsx` in the root of your project. This file configures the internationalization and theme settings of the site.

```typescript
export default {
  title: "My Project",
  tagline: "The best project ever!",
  url: "https://myproject.com",
  organizationName: "MyOrganization",
  projectName: "my-project",
  i18n: {
    defaultLocale: "en",
    locales: ["en", "ja"],
    localeConfigs: {
      en: { label: "English", htmlLang: "en", path: "en" },
      ja: { label: "日本語", htmlLang: "ja", path: "ja" },
    },
  },
  themeConfig: {
    colorMode: {
      defaultMode: "light",
      selectSwitch: true,
    },
    header: {
      title: "My Project",
      logo: {
        href: "/",
        type: "Vercel&Next.js",
      },
    },
    footer: {
      title: "My Footer",
      social: {
        github: true,
        twitter: "my_twitter_handle",
      },
    },
  },
};
```

2. **i18n Configuration**

- `defaultLocale` specifies the default language used.
- `locales` defines an array of supported languages, while `localeConfigs` provides settings for each language.
- The `path` sets the URL prefix. For example, the Japanese page will be redirected to `/ja`.

3. **Theme Settings**

- `colorMode` controls the switching between dark mode and system-based themes.
- The `header` and `footer` sections configure the logo and navigation in the site's header and footer.

### 2. `middleware.ts` Setup Guide

1. **Locale Middleware Setup**

To enable internationalization using `next-intl`, configure locale handling in `middleware.ts`. This middleware applies the appropriate language settings based on the URL.

```typescript
import createMiddleware from "next-intl/middleware";
import { locales, localePrefix, pathnames } from "@/components/provider/nav";
import richtplConfig from "../richtpl.config";
import { NextRequest, NextResponse } from "next/server";

const intlMiddleware = createMiddleware({
  locales,
  localePrefix,
  pathnames,
  defaultLocale: richtplConfig.i18n.defaultLocale,
});

export function middleware(request: NextRequest) {
  let response = intlMiddleware(request);
  if (!response) {
    response = NextResponse.next();
  }
  response.headers.set("x-pathname", request.nextUrl.pathname);
  return response;
}

export const config = {
  matcher: ["/", `/(ja|en)/:path*`],
};
```

2. **Matcher Configuration**

- The `matcher` defines the URL patterns processed by the middleware. The pattern `/(ja|en)/:path*` covers both English and Japanese pages.
- If other languages are added, they must be included in the `matcher` as well.

### Example of Theme Switching and i18n Implementation

```typescript
import { useState } from "react";
import { useTheme } from "next-themes";
import { useTranslations } from "next-intl";

export default function Header() {
  const { theme, setTheme } = useTheme();
  const t = useTranslations("Header");

  return (
    <header>
      <h1>{t("title")}</h1>
      <button onClick={() => setTheme(theme === "light" ? "dark" : "light")}>
        {theme === "light" ? "dark mode" : "light mode"}
      </button>
    </header>
  );
}
```

- This code implements a button to toggle themes and displays i18n-supported text.

### FAQ

#### Q: How can I add other languages?

A: To add a new language, update the `i18n` configuration in `richtpl.tsx` by adding the language to the `locales` array and providing corresponding settings in `localeConfigs`. Additionally, update the `matcher` in `middleware.ts` to include the new language.

#### Q: How can I customize theme switching?

A: You can customize the default theme and toggle options in the `themeConfig.colorMode` settings. Additionally, you can dynamically switch themes using the `useTheme` hook.
