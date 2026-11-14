import Link from "next/link";
import { headers } from "next/headers";
import { getDictionary } from "../../get-dictionary";
import { i18n, isValidLocale, getFirstPathSegment } from "../../i18n-config";

export default async function NotFound() {
  const headersList = await headers();
  const referer = headersList.get("referer") || "";
  const urlLocale = getFirstPathSegment(referer);
  const locale = isValidLocale(urlLocale) ? urlLocale : i18n.defaultLocale;
  const dictionary = (await getDictionary(locale))["not-found"];

  return (
    <div>
      <h2>{dictionary.title}</h2>
      <p>{dictionary.description}</p>
      <Link href={`/${locale}`}>{dictionary["back-home"]}</Link>
    </div>
  );
}
