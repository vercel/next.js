import { notFound } from "next/navigation";

export const i18n = {
  defaultLocale: "en",
  locales: ["en", "de", "cs"],
} as const;

export type Locale = (typeof i18n)["locales"][number];

export function isValidLocale(value: string | undefined): value is Locale {
  return value !== undefined && i18n.locales.includes(value as Locale);
}

export function assertValidLocale(value: string): asserts value is Locale {
  if (!isValidLocale(value)) notFound();
}

export function getFirstPathSegment(url: string): string | undefined {
  try {
    return new URL(url).pathname.split("/")[1] || undefined;
  } catch {
    return undefined;
  }
}
