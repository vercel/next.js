import { useRouter } from "next/router";
import Link from "next/link";
import RustComponent from "../components/RustComponent";

export default function Page() {
  const { query } = useRouter();
  const number = parseInt(query.number as string) || 30;

  return (
    <div>
      <RustComponent number={number} />
      <Link href={`/?number=${number + 1}`}>+</Link>
    </div>
  );
}
