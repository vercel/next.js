import { setTimeout } from "timers/promises";

export default async function Page() {
  await setTimeout(1000);

  return <h3>Dashboard</h3>;
}
