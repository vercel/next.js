import first from '../fixtures/first.first'
import second from '../fixtures/second.second'
import Client from './client'
import route from '../fixtures/page.route'
import '../fixtures/a.same-map'
import '../fixtures/b.same-map'
import '../fixtures/emit.name'

export default function Page() {
  return (
    <>
      <p>{`${first}:${second}`}</p>
      <span>{route}</span>
      <Client />
    </>
  )
}
