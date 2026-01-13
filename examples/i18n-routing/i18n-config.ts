import { notFound } from "next/navigation";

export const i18n = {
  defaultLocale: "en",
  locales: ["en", "de", "cs"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

export function isValidLocale(value: string): value is Locale {
  return i18n.locales.includes(value as Locale);
}

export function assertValidLocale(value: string): asserts value is Locale {
  if (!isValidLocale(value)) notFound();
}
