export default function Pid({ router }) {
  return (
    <div>
      route: {router.route}, query: {router.query.dynamic}
    </div>
  )
}
