import Devtools from 'cerebral/devtools'
import Head from 'next/head'
import {Controller, UniversalController} from 'cerebral'
import {Container} from '@cerebral/react'
import user from './modules/user'

const commonControler = {
  modules: {user},
  providers: [],
}
const ssr = typeof window === 'undefined'
const dev = process.env.NODE_ENV === 'development'

let controller = null

if (ssr) {
  controller = UniversalController(commonControler)
} else {
  controller = Controller(commonControler)
  if (dev) controller.devtools = Devtools({host: 'localhost:8585',})
}


export default function (initialSignal = null) {
  if (ssr) {
    if (initialSignal) controller.run(initialSignal)
    let __html = controller.getScript()
    __html = __html.substr(8, __html.length - 17)

    return p => <div>
      <Head><script dangerouslySetInnerHTML={{__html}}></script></Head>
      <Container controller={controller}><div>{p.children}</div></Container>
    </div>
  }

  return p => <div>
    <Container controller={Controller(commonControler)}><div>{p.children}</div></Container>
  </div>
}
