import { use } from "react";
export default function Layout(props) {
  const params = use(props.params);
  // if there's any usage of `searchParams`
  f1(params);
  f2(params);
}
