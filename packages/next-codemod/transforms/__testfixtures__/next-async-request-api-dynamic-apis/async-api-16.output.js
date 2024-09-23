import { cookies } from "next/headers";

function MyComponent() {
  callSomething(/* TODO: please manually await this call, codemod cannot transform due to undetermined async scope */
  cookies());
}
