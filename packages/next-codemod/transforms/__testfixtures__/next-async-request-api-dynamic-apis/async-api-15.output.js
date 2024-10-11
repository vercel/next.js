import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* @next-codemod-error Manually await this call, if it's a Server Component */
    cookies());
  }
}
