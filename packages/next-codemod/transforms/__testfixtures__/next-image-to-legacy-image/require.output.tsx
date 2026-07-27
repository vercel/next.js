// @ts-nocheck
/* eslint-disable */
export async function Home() {
  const Image = require("next/legacy/image");
  const Named = require("next/legacy/image");
  const Foo = require("foo");
  const Future1 = require("next/image");
  const Future2 = require("next/image");
  return (<div>
    <h1>Both</h1>
    <Image src="/test.jpg" width="200" height="300" />
    <Named src="/test.png" width="500" height="400" />
    <Future1 src="/test.webp" width="60" height="70" />
    <Future2 src="/test.avif" width="80" height="90" />
  </div>)
}
