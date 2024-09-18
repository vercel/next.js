import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* TODO: await this async call and propagate the async correctly */
    cookies());
  }
}
