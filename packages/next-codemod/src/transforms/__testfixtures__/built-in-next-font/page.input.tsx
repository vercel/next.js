// @ts-nocheck
/* eslint-disable */
import { Oswald } from "@next/font/google";
import localFont1 from "@next/font/local";
import type { AdjustFontFallback } from "@next/font"

const oswald = Oswald({ subsets: ["latin"] });
const myFont = localFont1({
  src: "./my-font.woff2",
});

import { Inter } from "next/font/google";
import localFont2 from "next/font/local";

const inter = Inter({ subsets: ["latin"] });
const myOtherFont = localFont2({
  src: "./my-other-font.woff2",
});

export default function WithFonts() {
  return (
    <>
      <p className={oswald.className}>oswald</p>
      <p className={myFont.className}>myFont</p>

      <p className={inter.className}>inter</p>
      <p className={myOtherFont.className}>myOtherFont</p>
    </>
  );
}
