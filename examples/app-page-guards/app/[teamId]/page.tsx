export default function TeamPage({ params }: { params: { teamId: string } }) {
  return <h1>Hello on team page for teamId '{params.teamId}'</h1>;
}
