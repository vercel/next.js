/* eslint-disable @next/next/link-passhref */
import Link from 'next/link';
import * as React from 'react';

export default function Home() {
  return (
      <main className="flex justify-center items-center w-full h-full">
        <section className='bg-white flex justify-center items-center w-full'>
          <div className=' flex flex-col text-3xl justify-center font-bold items-center min-h-screen text-center'>
            <h1 className='text-4xl'>Next.js + Tailwind CSS + TypeScript Starter</h1>
            <p className='mt-2 text-xl text-gray-800'>
              A starter for Next.js, Tailwind CSS, and TypeScript with Seo.
            </p>
            <p className='mt-[1rem] text-lg '>
              <Link href='https://github.com/Cyphen12/tailwind-typescript-starter'>
                <span className='bg-green-400 p-2  text-black/70 rounded font-bold shadow-xl '>
                See the repository
                </span>
              </Link>
            </p>
          </div>
        </section>
      </main>
  );
}