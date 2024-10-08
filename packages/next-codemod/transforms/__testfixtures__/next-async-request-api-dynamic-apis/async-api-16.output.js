import { cookies } from "next/headers";

function MyComponent() {
  callSomething(/* Next.js Dynamic Async API Codemod: please manually await this call, if it's a server component, you can turn it to async function */
  cookies());
}
