"use client";

// Bad case of using cookies in client, will error, do not transform
import { cookies } from "next/headers";

export default function Page() {
  usingCookiesWillErrorInClient(cookies());
}
