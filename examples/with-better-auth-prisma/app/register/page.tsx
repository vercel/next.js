import { getSession, signUp } from "@/lib/user-auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import React from "react";

const RegisterPage = async () => {
  const session = await getSession();
  if (session) {
    redirect("/");
  }
  return (
    <div className="w-dvw min-h-dvh flex items-center justify-center bg-black font-sans p-4">
      <div className="border border-neutral-800 rounded-lg shadow-sm p-8 min-w-[320px] max-w-sm w-full bg-neutral-950 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-neutral-100 mb-2 text-center">
          Register
        </h1>
        <form action={signUp} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="name" className="text-sm text-neutral-400">
              Name
            </label>
            <input
              name="name"
              id="name"
              min={3}
              className="border border-neutral-800 bg-neutral-900 rounded px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition text-sm placeholder:text-neutral-600"
              autoComplete="name"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-neutral-400">
              Email
            </label>
            <input
              name="email"
              id="email"
              placeholder="example@gmail.com"
              className="border border-neutral-800 bg-neutral-900 rounded px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition text-sm placeholder:text-neutral-600"
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-neutral-400">
              Password
            </label>
            <input
              type="password"
              name="password"
              id="password"
              placeholder="Enter your password"
              className="border border-neutral-800 bg-neutral-900 rounded px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition text-sm placeholder:text-neutral-600"
              autoComplete="new-password"
            />
          </div>
          <button
            type="submit"
            className="mt-2 bg-neutral-100 text-neutral-900 rounded px-4 py-2 hover:bg-neutral-200 transition text-sm font-medium"
          >
            Register
          </button>
        </form>
        <div className="text-center text-sm text-neutral-500">
          Already have an account?{" "}
          <Link
            href="/login"
            className="text-neutral-300 font-medium hover:underline hover:text-white"
          >
            Login
          </Link>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
