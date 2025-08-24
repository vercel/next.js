import { cookies, headers, type UnsafeUnwrappedHeaders } from 'next/headers';

export function myFun() {
  return async function () {
    (await cookies()).get('name')
  };
}

export function myFun2() {
  return function () {
    void (headers() as unknown as UnsafeUnwrappedHeaders)
  };
}
