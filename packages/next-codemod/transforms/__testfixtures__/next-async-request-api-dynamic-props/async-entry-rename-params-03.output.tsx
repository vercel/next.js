import { use } from "react";
export default function Page({ params: asyncParams } : { params: Promise<{ slug: string }> }) {
  const params = use(asyncParams);
  // usage of `params`
  globalThis.f1(params);
  globalThis.f2(params);
}
