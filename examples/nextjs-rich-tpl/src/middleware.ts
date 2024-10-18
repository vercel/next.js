// /src/middleware.ts

import createMiddleware from "next-intl/middleware";
import { locales, localePrefix, pathnames } from "@/components/provider/nav";

import richtplConfig from "../richtpl.config";
import { NextRequest, NextResponse } from "next/server";

// 既存のミドルウェアを作成
const intlMiddleware = createMiddleware({
  // A list of all locales that are supported
  locales,
  localePrefix,
  pathnames,
  // Used when no locale matches
  defaultLocale: richtplConfig.i18n.defaultLocale,
});

export function middleware(request: NextRequest) {
  // intlMiddleware を実行して、結果を取得
  let response = intlMiddleware(request);

  // intlMiddleware がレスポンスを返さなかった場合、デフォルトのNextResponseを作成
  if (!response) {
    response = NextResponse.next();
  }

  // カスタムヘッダーを追加する処理
  response.headers.set("x-pathname", request.nextUrl.pathname);

  return response;
}

export const config = {
  // Match only internationalized pathnames
  matcher: ["/", `/(ja|en)/:path*`],
};
