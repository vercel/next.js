"use client";

import { use } from "react";

import { cookies } from "next/headers";

export default function Page() {
  callSomething(use(cookies()));
}
