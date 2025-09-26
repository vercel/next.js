import Link from "next/link";
import { RustServerComponent } from "../components/RustComponent";

export default async function Page(props: {
  searchParams: Promise<{ [key: string]: string }>;
}) {
  const searchParams = await props.searchParams;
  const number = parseInt(searchParams.number || "30");
  return (
    <div>
      <RustServerComponent number={number} />
      <div>
        <Link href={`/?number=${number + 1}`}>+</Link>
      </div>
    </div>
  );
}
