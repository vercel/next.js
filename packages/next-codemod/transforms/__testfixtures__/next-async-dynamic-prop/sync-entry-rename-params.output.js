import { use } from "react";

export default function Layout({ params: asyncParams }) {
  const params = use(asyncParams);
  // if there's any usage of `searchParams`
  f1(params);
  f2(params);
}
