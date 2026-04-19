export default function Page() {
  return <p>{process.env.MY_DEVICE}</p>
}

export const runtime = 'edge'
