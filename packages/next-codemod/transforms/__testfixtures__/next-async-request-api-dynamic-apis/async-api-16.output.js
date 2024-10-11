import { cookies } from "next/headers";

function MyComponent() {
  callSomething(/* @next-codemod-error Manually await this call, if it's a Server Component */
  cookies());
}
