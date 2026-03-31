import { foo } from "./foo";
export default function Page() {
  /** @ts-ignore */
  foo();
  return <h1>Hello, Next.js!</h1>;
}
