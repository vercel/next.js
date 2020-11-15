import Link from "next/link";
import Flow from "state/flowContext";

function SomeComp() {
  const [flowState] = Flow.use()
  return (
    <>
      <p>{`This component is nested in a page and consumes the state, for example we can get the context.someId: ${flowState.context.someId}`}</p>
      {
        flowState.context.someInfo
          ? (
            <div>{flowState.context.someInfo}</div>
          )
          : (
            <div>Go to <Link href="/step/2">step 2</Link></div>
          )
      }
    </>
  )
}

export default SomeComp
