'use client'

import { useState } from "react";

export default function Page({ params } : { params: { slug: string } }) {
  const [text, setText] = useState("");
  // usage of `params`
  globalThis.f1(params);
  globalThis.f2(params);
}
