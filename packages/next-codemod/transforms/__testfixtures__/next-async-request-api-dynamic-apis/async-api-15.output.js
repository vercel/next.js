import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(/* TODO: please manually await this call, codemod cannot transform due to undetermined async scope */
    cookies());
  }
}
