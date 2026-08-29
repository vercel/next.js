export function Stats({ people, teams }: { people: number; teams: number }) {
  return (
    <p className="stats">
      {people} people · {teams} teams
    </p>
  )
}
