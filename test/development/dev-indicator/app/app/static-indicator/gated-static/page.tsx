export default async function Page() {
  const origin = process.env['DEV_INDICATOR_GATE_ORIGIN']
  if (!origin) throw new Error('Missing gate origin')

  await fetch(`${origin}/__gate/static`, { cache: 'force-cache' })

  return <p id="static-gate-released">The static gate was released.</p>
}
