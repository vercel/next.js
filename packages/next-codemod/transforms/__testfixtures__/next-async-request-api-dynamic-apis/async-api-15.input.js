import { cookies } from "next/headers";

async function MyComponent() {
  function asyncFunction() {
    callSomething(cookies());
  }
}
