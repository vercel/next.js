import { use } from "react";
export default function Page(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  // usage of `params`
  globalThis.f1(params);
  globalThis.f2(params);
}
