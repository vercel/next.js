// @ts-nocheck
/* eslint-disable */
const Image = require("next/legacy/image");
const Named = require("next/legacy/image");
const Foo = require("foo");

export default function Home() {
  return (
    <div>
      <h1>Upgrade</h1>
      <Image src="/test.jpg" width="200" height="300" layout="fixed" />
      <Named src="/test.png" width="400" height="500" layout="fixed" />
      <Foo />
    </div>
  );
}
