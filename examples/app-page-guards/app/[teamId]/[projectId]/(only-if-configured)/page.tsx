export default function ProjectDashboardPage({
  params,
}: {
  params: { projectId: string };
}) {
  return (
    <h1>Hello on project dashboard page for projectId '{params.projectId}'</h1>
  );
}
