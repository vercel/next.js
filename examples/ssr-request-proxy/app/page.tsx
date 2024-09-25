
import Link from 'next/link';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const PROXY = process.env.SSR_PROXY ?? 'http://172.12.213.98:1234'

const proxyAgent = new ProxyAgent(PROXY)
setGlobalDispatcher(proxyAgent)

export default async function Home() {
  const ssrData = await fetch('https://jsonplaceholder.typicode.com/todos/1')
  .then(response => response.json())
  .then(json => {
    console.log(json)
    return json
  })

  return (
    <main>
      <p>
      This data taken from server and pass through {PROXY} proxy
      </p>
     <p>{JSON.stringify(ssrData)}</p>
     <Link href="/axios">Axios version</Link>
    </main>
  );
}
