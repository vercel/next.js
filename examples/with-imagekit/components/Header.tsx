"use client";
import Link from "next/link";
import Logo from "@/components/Icons/Logo";


export default function Header() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <p className="text-white/75 text-[1.5rem]">Media Gallery</p>
      <div className="flex gap-[1rem] items-center">
        <p className="text-white/75 text-[0.8rem]">PoweredBy</p> <Logo />
      </div>
      <div>
        <p className="text-white/75">
          This example demonstrates how to build an image and video gallery
          using Next.js, ImageKit, and Tailwind CSS.
        </p>
        <p className="text-white/75">
          You can explore this code for this example on
          <Link
            href="https://github.com/vercel/next.js/blob/canary/examples/with-imagekit"
            className="text-blue-500 hover:text-blue-700 ml-[5px]"
          >
            Github
          </Link>
          .
        </p>
      </div>
    </div>
  );
}