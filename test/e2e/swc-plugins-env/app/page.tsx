// ENV_CHECK will be replaced by the SWC plugin with "development" or "production"
declare const ENV_CHECK: string

export default function Home() {
  return <main>The SWC plugin received env={ENV_CHECK}</main>
}
