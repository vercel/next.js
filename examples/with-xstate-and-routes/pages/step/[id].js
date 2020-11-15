import Link from "next/link";
import Flow from "state/flowContext";
import SomeComp from 'components/SomeComp'

export default function Step1() {
  const [flowState] = Flow.use()
  return (
    <div>
      <h1>Step {flowState.context.someId}</h1>
      Go to <Link href="/">start</Link>
      <SomeComp />
    </div>
  );
}
