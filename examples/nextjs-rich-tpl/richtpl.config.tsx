import Config from "@/types/richtpl.config";
import { Book, Home } from "lucide-react";

/**
 * Site configuration object.
 * Contains general site information, i18n settings, and theme configuration.
 */
const config: Config = {
  // Tagline for the site
  tagline: "Next.js Template",

  // URL to the favicon
  favicon: "/favicon.ico",

  // Production URL of the site
  url: "https://nextjs-rich-tpl.vercel.app",

  // Base URL pathname (for GitHub Pages deployment)
  baseUrl: "/",

  // GitHub deployment configuration
  organizationName: "fun117", // GitHub organization/user name
  projectName: "nextjs-rich-tpl", // GitHub repository name

  // Internationalization (i18n) configuration
  i18n: {
    // Default locale for the site
    defaultLocale: "ja",
    // List of supported locales
    locales: ["ja", "en"],
    // Locale-specific configurations
    localeConfigs: {
      ja: {
        label: "日本語", // Label for the Japanese locale
        htmlLang: "ja-JP", // HTML language attribute for Japanese
        path: "ja", // Path prefix for Japanese locale
      },
      en: {
        label: "English", // Label for the English locale
        htmlLang: "en-US", // HTML language attribute for English
        path: "en", // Path prefix for English locale
      },
    },
    selectButton: true, // Option to include a locale selection button
  },

  // Theme and layout configuration
  themeConfig: {
    // Color mode settings
    colorMode: {
      defaultMode: "system", // Default color mode (light, dark, or system)
      selectSwitch: true, // Whether to allow switching color modes
    },
    // URL to the social card image (replace with your project's image)
    image: "/image/upload/front/nextjs/twitter-card.png",
    // Metadata for the site
    metadata: {
      keywords: [
        "Template",
        "i18n",
        "template",
        "Next.js",
        "autoprefixer",
        "rich",
        "tailwindcss",
        "framer-motion",
        "next-themes",
        "vercel-hosting",
        "next-intl",
        "lucide-icons",
      ],
      authors: { name: "Fun117", url: "https://fun117.dev" },
      creator: "Fun117",
      icons: "/favicon.ico",
      generator: "Next.js",
      publisher: "Vercel",
      robots: "follow, index",
      metadataBase: new URL("https://nextjs-rich-tpl.vercel.app"),
    },
    SearchCommand: [
      {
        label: "Pages",
        i18n_text: true,
        items: [
          {
            label: "Home",
            icon: <Home />,
            to: "/",
            i18n_text: true,
          },
          {
            label: "About",
            icon: <Book />,
            to: "/about",
            i18n_text: true,
            i18n_link: true,
          },
        ],
      },
    ],
    // Header configuration
    header: {
      // Title for the header
      title: "Richtpl",
      // Logo configuration
      logo: {
        type: "Vercel&Next.js", // Type of logo
      },
      // Navigation items in the header
      items: {
        // Items on the left side of the header
        left: [
          {
            label: "Home", // Label for the item
            to: "/", // Internal URL path
            i18n_link: true, // Whether to include locale prefix in the URL
            i18n_text: true, // Whether to include locale prefix in the Text
          },
          {
            label: "About", // Label for the item
            to: "/about", // Internal URL path
            i18n_link: true, // Whether to include locale prefix in the URL
            i18n_text: true, // Whether to include locale prefix in the Text
          },
        ],
        project: {
          repository: "block", // Display the repository link in the header
        },
      },
    },
    // Footer configuration
    footer: {
      // Title for the footer
      title: "Richtpl",
      // Logo configuration
      logo: {
        href: "https://vercel.com/home?utm_source=next-site&utm_medium=footer&utm_campaign=next-website",
        type: "Vercel", // Type of logo
      },
      // Social links configuration
      social: {
        github: true, // Whether to include a GitHub link
        twitter: "Fun_117", // Twitter handle
      },
      footerText: {
        i18n: true, // Whether the footer text should be localized
      },
      // Footer navigation items
      items: [
        {
          title: "Resources", // Title for the section
          title_i18n: true, // Whether the title should be localized
          contents: [
            {
              label: "Docs", // Label for the item
              href: "https://nextjs.org/docs", // External URL
              target: "_blank", // Open link in a new tab
              i18n_text: true, // Whether the text should be localized
            },
            {
              label: "Learn",
              href: "https://nextjs.org/learn",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Showcase",
              href: "https://nextjs.org/showcase",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Blog",
              href: "https://nextjs.org/blog",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Analytics",
              href: "https://vercel.com/analytics?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Next&#46;js Conf",
              href: "https://nextjs.org/conf",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Previews",
              href: "https://vercel.com/products/previews?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
          ],
        },
        {
          title: "More",
          title_i18n: true,
          contents: [
            {
              label: "Next&#46;js Commerce",
              href: "https://vercel.com/templates/next.js/nextjs-commerce?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Contact Sales",
              href: "https://vercel.com/contact/sales?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "GitHub",
              href: "https://github.com/vercel/next.js",
              target: "_blank",
            },
            {
              label: "Releases",
              href: "https://github.com/vercel/next.js/releases",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Telemetry",
              href: "https://nextjs.org/telemetry",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Governance",
              href: "https://nextjs.org/governance",
              target: "_blank",
              i18n_text: true,
            },
          ],
        },
        {
          title: "About Vercel",
          title_i18n: true,
          contents: [
            {
              label: "Next&#46;js + Vercel",
              href: "https://vercel.com/solutions/nextjs?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "Open Source Software",
              href: "https://vercel.com/oss?utm_source=next-site&utm_medium=footer&utm_campaign=home",
              target: "_blank",
              i18n_text: true,
            },
            {
              label: "GitHub",
              href: "https://github.com/vercel",
              target: "_blank",
            },
            {
              label: "X",
              href: "https://twitter.com/vercel",
              target: "_blank",
            },
          ],
        },
      ],
    },
    // Sitemap Configuration
    sitemap: {
      excludedDirs: [
        "error", // Directory for error pages
        "not-found", // Directory for 404 pages
        "[...rest]", // Directory for [...rest] pages
      ],
    },
  },
};

export default config;
