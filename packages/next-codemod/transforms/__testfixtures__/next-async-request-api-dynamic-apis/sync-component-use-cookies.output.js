import { cookies } from "next/headers";

function MyComponent() {
  callSomething(/* TODO: await this async call and propagate the async correctly */
  cookies());
}
