import { createServerI18next } from "next-i18next/server";
import i18nConfig from "./i18n.config";

// One server module: layouts, pages and generateMetadata import getT from
// here, so there is no initialization step to run first.
export const { getT, getResources, generateI18nStaticParams } =
  createServerI18next(i18nConfig);
