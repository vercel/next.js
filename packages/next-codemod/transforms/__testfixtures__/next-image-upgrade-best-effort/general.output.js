import Image from "next/image";
import Named, { Blarg } from "next/image";
import Foo from "foo";
import img from "../public/img.jpg";

export default function Home() {
  return (
    <div>
      <h1>Upgrade</h1>
      <Image src="/test.jpg" width="200" height="300" />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        style={{
          maxWidth: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        style={{
          width: "100%",
          height: "auto"
        }} />
      <Image src="/test.jpg" width="200" height="300" />
      <div style={{ position: 'relative', width: '300px', height: '500px' }}>
        <Image
          alt="example alt text"
          src={img}
          fill
          style={{
            objectFit: "contain"
          }} />
      </div>
      <Named src="/test.png" width="500" height="400" />
      <Foo bar="1" />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        style={{
          color: "green",
          width: "100%",
          height: "auto"
        }} />
    </div>
  );
}