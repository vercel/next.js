"use client";

import { cookies } from "next/headers";

export default function Page() {
  callSomething(cookies());
}
