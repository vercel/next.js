import { headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function MyComp() {
  return (headers() as unknown as UnsafeUnwrappedHeaders);
}

export function MyComp2() {
  return (headers() as unknown as UnsafeUnwrappedHeaders);
}

export function MyComp3() {
  return (headers() as unknown as UnsafeUnwrappedHeaders);
}
