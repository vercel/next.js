export async function getProjectTotals() {
  await new Promise((resolve) => setTimeout(resolve, 120))
  return { active: 12, archived: 4 }
}
