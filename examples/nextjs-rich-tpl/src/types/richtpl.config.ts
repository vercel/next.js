import { Metadata, MetadataRoute } from "next";
import { HTMLAttributeAnchorTarget } from "react";

/**
 * Internationalization (i18n) configuration type.
 * Contains default locale, supported locales, and locale-specific configurations.
 */
type i18n = {
  defaultLocale: string; // The default language locale
  locales: string[]; // Array of supported locales
  localeConfigs: { [locale: string]: localeConfig }; // Configuration for each locale
  selectButton?: boolean; // Option to include a locale selection button
};

/**
 * Configuration for a specific locale.
 * Includes label, HTML language attribute, and path prefix.
 */
type localeConfig = {
  label: string; // Human-readable name of the locale
  htmlLang: string; // HTML language attribute value
  path: string; // URL path prefix for the locale
};

type SearchCommand = {
  label: string;
  i18n_text?: boolean;
  items: SearchCommandItem[];
};

type SearchCommandItem = {
  label: string; // Label for the item
  icon: React.ReactNode; // Icon for the item
  action?: () => void; // Action to be performed when the item is clicked
  href?: string; // URL for the item
  to?: string; // Internal URL
  target?: HTMLAttributeAnchorTarget; // Target attribute for the link (optional)
  i18n_text?: boolean; // Whether the text should be localizedL
  i18n_link?: boolean; // Whether the link should be localized
};

/**
 * Header configuration type.
 * Defines title, logo, and navigation items for the header.
 */
type Header = {
  title: string; // Header title
  logo?: {
    href?: string; // URL
    type?: "Vercel&Next.js"; // Type of logo
    content?: React.ReactNode | React.JSX.Element; // Logo content
  };
  items?: {
    left?: NavItem[]; // Array of navigation items on the left side
    right?: NavItem[]; // Array of navigation items on the right side
    project?: {
      repository?: "block" | "hidden"; // Visibility of the repository link
    };
  };
  hiddenPages?: string[];
};

/**
 * Footer configuration type.
 * Defines title, logo, social links, and navigation items for the footer.
 */
type Footer = {
  // Title for the footer
  title: string; // Footer title
  // Logo configuration
  logo?: {
    href?: string; // URL
    type?: "Vercel"; // Type of logo
    i18n?: boolean; // Whether the logo should be localized
    content?: React.ReactNode | React.JSX.Element; // Logo content
  };
  // Social links configuration
  social?: {
    github?: boolean; // Whether to include a GitHub link
    twitter?: string; // Twitter handle
  };
  // Footer text configuration
  footerText?: {
    text?: string; // Footer tex
    i18n?: boolean; // Whether the footer text should be localized
  };
  // Footer navigation items
  items?: {
    title: string; // Title of the navigation section
    title_i18n?: boolean; // Whether the title should be localized
    contents?: NavItem[]; // Array of navigation items in the section
  }[];
  hiddenPages?: string[];
};

/**
 * Theme configuration type.
 * Defines color mode settings, social card image, metadata, header, and footer.
 */
type ThemeConfig = {
  colorMode: {
    defaultMode: "light" | "dark" | "system"; // Default color mode
    selectSwitch: boolean; // Whether to allow switching color modes
  };
  image?: string; // Social card image URL
  metadata?: Metadata; // Metadata for the site
  SearchCommand?: SearchCommand[];
  header?: Header; // Header configuration
  footer?: Footer; // Footer configuration
  sitemap?: {
    // List of directories to exclude from the sitemap
    excludedDirs?: string[];
  };
  robots?: MetadataRoute.Robots;
};

/**
 * Navigation item type for header and footer.
 * Defines label, URL path or external link, target, and i18n settings.
 */
type NavItem = {
  label: string; // Display label for the navigation item
  href?: string; // External URL
  to?: string; // Internal URL path
  target?: HTMLAttributeAnchorTarget; // Link target attribute
  i18n_text?: boolean; // Whether the text should be localized
  i18n_link?: boolean; // Whether to include locale prefix in the URL
};

/**
 * Main configuration type for the site.
 * Includes basic site information, i18n settings, and theme configuration.
 */
interface Config {
  title?: string; // Site title
  description?: string; // Site description
  tagline: string; // Site tagline
  favicon?: string; // URL to the favicon

  url: string; // Production URL of the site
  baseUrl?: string; // Base URL pathname

  organizationName: string; // GitHub organization/user name
  projectName: string; // GitHub repository name

  i18n: i18n; // Internationalization settings

  themeConfig: ThemeConfig; // Theme and layout configuration
}

export default Config;
