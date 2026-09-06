export const instant = { level: 'experimental-error' }

export default async function Page() {
  await new Promise<void>((resolve) => process.nextTick(resolve))
  return <p>{Date.now()}</p>
}
