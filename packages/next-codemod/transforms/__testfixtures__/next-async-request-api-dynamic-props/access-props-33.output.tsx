import { use } from "react";
function useHook() {}

export default function Page(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  useHook()
  return <p>child {params.slug}</p>
}
