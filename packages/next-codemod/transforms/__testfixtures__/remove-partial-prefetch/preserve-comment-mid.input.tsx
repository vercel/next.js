// @ts-nocheck
import { Suspense } from 'react';

// TODO(runtime-prefetch): assess with the user (prefetch = 'allow-runtime')
export const prefetch = 'partial';

export default function Page() {
  return <p>hello world</p>;
}
