import Link from "next/link";
import CreateOrderButton from "../components/CreateOrderButton";

const IndexPage = () => (
  <>
    <h1>Hello Next.js 👋</h1>
    <CreateOrderButton />
    <p>
      <Link href="/about">About</Link>
    </p>
  </>
);

export default IndexPage;
