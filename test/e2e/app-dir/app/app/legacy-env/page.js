export default function Page() {
  if (!process.env.LEGACY_ENV_KEY) {
    throw new Error('missing env key LEGACY_ENV_KEY!!')
  }
  return <p id="legacy-env">{process.env.LEGACY_ENV_KEY}</p>
}
