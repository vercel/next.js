const MY_DEVICE = process.env.MY_DEVICE?.slice()

export default function Page() {
  return <p>{MY_DEVICE}</p>
}
