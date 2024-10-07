import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* TODO: please manually await this call, if it's a server component, you can turn it to async function */
    cookies());
  }
}
