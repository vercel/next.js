
import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import Link from 'next/link';

const PROXY = process.env.SSR_PROXY ?? 'http://172.12.213.98:1234'

const agent = new HttpsProxyAgent(PROXY);

export default async function Axios() {
  const ssrData = await axios(
    {
      method:'GET',
      url:'https://jsonplaceholder.typicode.com/todos/1',
      httpAgent: agent,
      httpsAgent: agent,
      proxy: false,
      timeout: 1000,
    }
  )
      .then(response => {
      console.log(response.data)
      return response.data
    })

  return (
    <main>
      <p>
      This data taken from server and pass through {PROXY} proxy
      </p>
     <p>{JSON.stringify(ssrData)}</p>
     <Link href="/">Fetch version</Link>
    </main>
  );
}
