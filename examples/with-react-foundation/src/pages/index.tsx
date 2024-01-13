import Link from "next/link";
import { Article } from "../components/Article";
import { Header } from "../components/Header";
import { Callout } from "react-foundation";

export default function Home() {
  return (
    <>
      <Header />
      <Article />
      <div className="callout-sizes-example">
        <Callout>
          <h5>with-react-foundation</h5>
          <p>
            Example repository of <code>Next.js</code> +{" "}
            <code>react-foundation</code>.
          </p>
          <Link href="https://nextjs.org" passHref={true}>
            view repository
          </Link>
        </Callout>
      </div>
    </>
  );
}
