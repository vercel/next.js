import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* Next.js Dynamic Async API Codemod: please manually await this call, if it's a server component, you can turn it to async function */
    cookies());
  }
}
