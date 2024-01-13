export default function ProjectSetupPage({
  params,
}: {
  params: { projectId: string };
}) {
  return (
    <h1>Hello on project setup page for projectId '{params.projectId}'</h1>
  );
}
