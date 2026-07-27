import { use } from "react";
export default function Page(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params);
  Foo.useFoo()
  return <p>child {params.slug}</p>
}
