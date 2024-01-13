import { redirect } from "next/navigation";

export default async function PageGuard({
  params,
}: {
  params: { teamId: string; projectId: string };
}) {
  console.log("Hello from page guard for /[teamId]/[projectId]");

  const validProjectIds = ["unconfigured-example", "configured-example"];

  if (!validProjectIds.includes(params.projectId)) {
    await redirect(`/${params.teamId}`);
  }
}
