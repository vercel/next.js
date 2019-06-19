import Link from "next/link";
import { Card } from "../components/Card";
import "../styles/base.scss";

export default () => (
  <div>
    {/* <Link href="/about">
      <a>About</a>
    </Link> */}
    {/* products.map(product => {
      return (
        <Card key=product.id/>
      )
    }) */}
    <Card />
  </div>
);
