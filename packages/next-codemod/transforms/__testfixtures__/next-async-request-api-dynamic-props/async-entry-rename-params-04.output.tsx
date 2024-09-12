'use client';
import { use } from "react";

import { useState } from "react";

export default function Page({ params: asyncParams } : { params: Promise<{ slug: string }> }) {
  const params = use(asyncParams);
  const [text, setText] = useState("");
  // usage of `params`
  globalThis.f1(params);
  globalThis.f2(params);
}
