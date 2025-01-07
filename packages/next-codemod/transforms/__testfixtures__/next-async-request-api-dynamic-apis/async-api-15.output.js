import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* @next-codemod-error Manually await this call and refactor the function to be async */
    cookies());
  }
}
