"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { useSession } from "@descope/nextjs-sdk/client";

export default function HomePage() {
  const { isAuthenticated } = useSession();
  const [userInfo, setUserInfo] = useState("");

  const fetchUserInfo = async () => {
    try {
      const response = await fetch("/api/user", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error("Failed to fetch user info");
      }

      const data = await response.json();
      setUserInfo(data);
    } catch (error) {
      setUserInfo("");
    }
  };

  return (
    <div className="bg-gray-50 dark:bg-gray-950">
      <div className="container px-4 md:px-6">
        <header className="py-4 md:py-8 lg:py-12">
          <div className="space-y-4 text-center">
            <h1 className="text-3xl font-bold tracking-tighter sm:text-5xl">
              Auth for Next.js. Powered by Descope
            </h1>
            <p className="mx-auto max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
              The easiest way to add secure drag-and-drop authentication to your
              Next.js app. Secure, customizable, and developer-friendly.
            </p>
          </div>
        </header>
      </div>
      <section className="w-full py-4 md:py-16 lg:py-24">
        <div className="container px-4 md:px-6">
          <div className="grid items-center gap-6 lg:grid-cols-[1fr_500px] lg:gap-12 xl:grid-cols-[1fr_550px]">
            <img
              alt="Image"
              className="mx-auto aspect-video overflow-hidden rounded-xl object-cover object-center sm:w-full"
              height="310"
              src="/descope/sso-flow.gif"
              width="550"
            />
            <div className="flex flex-col justify-center space-y-4">
              <div className="space-y-2">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Secure your app with ease
                </h2>
                <p className="max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                  Descope provides a seamless authentication experience for your
                  users. No more worrying about login forms, user management, or
                  SSO. Let Descope handle it all.
                </p>
              </div>
              <ul className="grid gap-2 py-4">
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Easy integration with your app
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  MFA and Passwordless Login Options
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Fine Grained Authorization
                </li>
                <li>
                  <CheckIcon className="mr-2 inline-block h-4 w-4" />
                  Drag and drop SSO
                </li>
              </ul>
              <div className="flex flex-col gap-2 min-[400px]:flex-row">
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-8 text-sm font-medium shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:hover:bg-gray-800 dark:hover:text-gray-50 dark:focus-visible:ring-gray-300 dark:border-gray-800"
                  href="https://www.descope.com"
                  target="_blank"
                >
                  Learn More
                </a>
                <a
                  className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-8 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                  href="https://app.descope.com"
                  target="_blank"
                >
                  Get Started
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section className="w-full py-6 md:py-24 lg:py-32">
        <div className="container px-4 md:px-6">
          {!isAuthenticated && (
            <div className="bg-gray-50 dark:bg-gray-950">
              <div className="container px-4 md:px-6">
                <div className="py-4 md:py-8 lg:py-12">
                  <div className="space-y-4 text-center">
                    <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                      Currently, you're not signed in.
                    </h2>
                    <p className="mx-auto max-w-[600px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                      Click on the button below to sign in and test the Next.js
                      API.
                    </p>
                    <a className={"flex justify-center"} href={"/sign-in"}>
                      <Button>Sign In</Button>
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}
          {isAuthenticated && (
            <div className="flex flex-col lg:flex-row items-center lg:items-center gap-6 lg:gap-12 mt-8 lg:mt-12">
              <div className="space-y-8 w-full lg:w-auto text-center lg:text-left">
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">
                  Your User Information
                </h2>
                <p className="text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
                  Click the button below to fetch and display your user
                  information.
                </p>
                <button
                  className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-8 text-sm font-medium text-gray-50 shadow transition-colors hover:bg-gray-900/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:bg-gray-50 dark:text-gray-900 dark:hover:bg-gray-50/90 dark:focus-visible:ring-gray-300"
                  onClick={fetchUserInfo}
                >
                  Fetch User Info
                </button>
              </div>
              <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow w-full lg:max-w-[600px] lg:ml-auto">
                {userInfo && (
                  <pre className="text-gray-800 dark:text-gray-200 text-left overflow-auto max-h-[300px]">
                    {JSON.stringify(userInfo, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </section>
      <div className="border-t border-gray-200 dark:border-gray-800"></div>
    </div>
  );
}

function CheckIcon(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
