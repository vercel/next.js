import { cookies } from "next/headers";

function MyComponent() {
  callSomething(cookies());
}
