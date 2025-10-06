/* this is a comment */
'use client';
import { use } from "react";
export default function Page(props: {
  params: Promise<any>
}): JSX.Element {
  const params = use(props.params);
  return <div {...params} />;
}
