import { useEffect } from "react"
import { useRouter } from "next/router"
import { useMachine } from "@xstate/react"

import flowMachine from "./flowMachine"

const createFlow = () => {
  const router = useRouter()
  const [state, send] = useMachine(flowMachine)

  useEffect(() => {
    const handleRouteChange = url => {
      switch( url ) {
        case '/step/1':
          send("STEP1", {
            someId: 1
          })
          break
        case '/step/2':
          send("STEP2", {
            someId: 2,
            someInfo: 'Info set in step 1'
          })
          break
        default:
          send("START")
      }
    };

    router.events.on("routeChangeStart", handleRouteChange)

    return () => router.events.off("routeChangeStart", handleRouteChange)
  }, [state])

  return [state, send]
};

const Context = React.createContext()
const Consumer = Context.Consumer
const Provider = p => <Context.Provider value={createFlow()} {...p} />
const use = () => React.useContext(Context)

export default { Context, Provider, Consumer, use }