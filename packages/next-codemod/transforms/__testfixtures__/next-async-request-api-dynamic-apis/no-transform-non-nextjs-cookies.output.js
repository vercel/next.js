'use client'

import { cookies } from "mylib";

export default function Page() {
  usingCookiesWillErrorInClient(cookies());
}
