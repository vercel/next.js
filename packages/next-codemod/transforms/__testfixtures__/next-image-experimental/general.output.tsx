// @ts-nocheck
/* eslint-disable */
import Image from "next/image";
import Named, { Blarg } from "next/image";
import type { ImageProps } from "next/image";
import { type ImageLoaderProps } from "next/image";
import Foo from "foo";
import img from "../public/img.jpg";

export default function Home() {
  const myStyle = { color: 'black' };
  return (
    <div>
      <h1>Upgrade</h1>
      <Image
        src="/test.jpg"
        width="100"
        height="200"
        style={{
          maxWidth: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.jpg"
        width="300"
        height="400"
        style={{
          maxWidth: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        sizes="100vw"
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
          sizes="100vw"
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
        sizes="100vw"
        style={{
          color: "green",
          width: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        sizes="100vw"
        style={{
          color: myStyle.color,
          width: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.jpg"
        width="200"
        height="300"
        sizes="50vw"
        style={{
          color: "#fff",
          width: "100%",
          height: "auto"
        }} />
      <Image src="/test.jpg" width="200" height="300" />
      <Image
        src="/test.lit"
        width="200"
        height="300"
        sizes="100vw"
        style={{
          ...myStyle,
          width: "100%",
          height: "auto"
        }} />
      <Image
        src="/test.dot"
        width="200"
        height="300"
        sizes="100vw"
        style={{
          ...myStyle,
          width: "100%",
          height: "auto"
        }} />
    </div>
  );
}
