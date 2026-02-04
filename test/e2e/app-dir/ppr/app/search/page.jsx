export default async function Page({ searchParams }) {
  return (await searchParams).query ?? null
}
