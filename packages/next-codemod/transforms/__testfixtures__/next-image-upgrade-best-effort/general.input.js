import Image from "next/legacy/image";
import Named, { Blarg } from "next/legacy/image";
import Foo from "foo";

export default function Home() {
  return (<div>
    <h1>Upgrade</h1>
    <Image src="/test.jpg" width="200" height="300" />
    <Named src="/test.png" width="500" height="400" layout="fixed" />
    <Foo bar="1" />
  </div>)
}