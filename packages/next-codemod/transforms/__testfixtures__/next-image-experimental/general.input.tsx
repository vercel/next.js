// @ts-nocheck
/* eslint-disable */
import Image from "next/legacy/image";
import Named, { Blarg } from "next/legacy/image";
import type { ImageProps } from "next/legacy/image";
import { type ImageLoaderProps } from "next/legacy/image";
import Foo from "foo";
import img from "../public/img.jpg";

export default function Home() {
  const myStyle = { color: 'black' };
  return (
    <div>
      <h1>Upgrade</h1>
      <Image src="/test.jpg" width="100" height="200" />
      <Image src="/test.jpg" width="300" height="400" layout="intrinsic" />
      <Image src="/test.jpg" width="200" height="300" layout="responsive" />
      <Image src="/test.jpg" width="200" height="300" layout="fixed" />
      <div style={{ position: 'relative', width: '300px', height: '500px' }}>
        <Image
          alt="example alt text"
          src={img}
          layout="fill"
          objectFit="contain"
        />
      </div>
      <Named src="/test.png" width="500" height="400" layout="fixed" />
      <Foo bar="1" />
      <Image src="/test.jpg" width="200" height="300" layout="responsive" style={{color: "green"}} />
      <Image src="/test.jpg" width="200" height="300" layout="responsive" style={{color: myStyle.color}} />
      <Image src="/test.jpg" width="200" height="300" layout="responsive" sizes="50vw" style={{color: "#fff"}} />
      <Image src="/test.jpg" width="200" height="300" layout="fixed" lazyBoundary="1500px" lazyRoot={img} />
      <Image src="/test.lit" width="200" height="300" layout="responsive" style={myStyle} />
      <Image src="/test.dot" width="200" height="300" layout="responsive" style={{...myStyle}} />
    </div>
  );
}
