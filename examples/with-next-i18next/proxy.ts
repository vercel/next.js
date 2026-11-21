import { createProxy } from "next-i18next/proxy";
import i18nConfig from "./i18n.config";

export const proxy = createProxy(i18nConfig);

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
