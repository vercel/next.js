import Link from "next/link";
import Clock from "./_components/Clock";
import Counter from "./_components/Counter";

export default function Page() {
  return (
    <div>
      <Link href="/about">Go to About</Link>
      <br />
      <br />
      <div>
        <Clock />
        <Counter />
      </div>
    </div>
  );
}
