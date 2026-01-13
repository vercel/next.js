import Link from "next/link";
import { headers } from "next/headers";
import { getDictionary } from "../../get-dictionary";
import { i18n, isValidLocale } from "../../i18n-config";
import LocaleSwitcher from "./components/locale-switcher";

export default async function NotFound() {
  const headersList = await headers();

  // Try to extract locale from referer URL
  const referer = headersList.get("referer") || "";
  const pathMatch = referer.match(/\/([^\/]+)/);
  const urlLocale = pathMatch?.[1];

  // Use extracted locale if valid, otherwise fall back to default
  const locale =
    urlLocale && isValidLocale(urlLocale) ? urlLocale : i18n.defaultLocale;
  const dictionary = await getDictionary(locale);

  return (
    <div>
      <LocaleSwitcher />
      <h2>{dictionary["not-found"].title}</h2>
      <p>{dictionary["not-found"].description}</p>
      <Link href={`/${locale}`}>{dictionary["not-found"]["back-home"]}</Link>
    </div>
  );
}
