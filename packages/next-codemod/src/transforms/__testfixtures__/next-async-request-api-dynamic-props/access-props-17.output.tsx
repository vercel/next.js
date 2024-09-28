'use client';
import { use } from "react";

function Page(props: any) {
  const params = use(props.params);
  console.log(params.foo)
  if (typeof window === 'undefined') {
    console.log(params.bar)
  }
}

export default Page
