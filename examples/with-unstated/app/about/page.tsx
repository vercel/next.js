import Link from "next/link";
import Clock from "../_components/Clock";
import Counter from "../_components/Counter";

export default function Index() {
  return (
        <div>
          <Link href="/">go to Index</Link>
          <br />
          <br />
          <div>
            <Clock />
            <Counter />
          </div>
        </div>
  );
}
