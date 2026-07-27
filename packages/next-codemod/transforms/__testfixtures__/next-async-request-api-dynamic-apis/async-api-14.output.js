import { cookies } from "next/headers";

export default async function Page() {
  callSomething(await cookies());
}
