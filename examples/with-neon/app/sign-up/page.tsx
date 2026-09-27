import Link from "next/link";
import { SignUpForm } from "@/components/sign-up-form";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 md:max-w-lg md:px-0 lg:max-w-xl">
        <main className="flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-sm">
            <h1 className="text-3xl font-semibold leading-none tracking-tighter md:text-4xl">
              Sign Up
            </h1>
            <p className="mt-3.5 text-base leading-snug tracking-tight text-[#61646B] md:text-lg dark:text-[#94979E]">
              Create an account to get started.
            </p>

            <SignUpForm />

            <p className="mt-6 text-center text-sm text-[#61646B] dark:text-[#94979E]">
              Already have an account?{" "}
              <Link
                href="/sign-in"
                className="font-medium text-primary hover:underline"
              >
                Sign in
              </Link>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
