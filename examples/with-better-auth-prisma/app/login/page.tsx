import { getSession } from "@/lib/user-auth";
import { redirect } from "next/navigation";
import { signIn } from "@/lib/user-auth";
import Link from "next/link";

const LoginPage = async () => {
  const session = await getSession();
  if (session) {
    redirect("/");
  }
  return (
    <div className="w-dvw min-h-dvh flex items-center justify-center bg-black font-sans p-4">
      <div className="border border-neutral-800 rounded-lg shadow-sm p-8 min-w-[320px] max-w-sm w-full bg-neutral-950 flex flex-col gap-6">
        <h1 className="text-xl font-semibold text-neutral-100 mb-2 text-center">
          Login
        </h1>
        <form action={signIn} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label htmlFor="email" className="text-sm text-neutral-400">
              Email
            </label>
            <input
              className="border border-neutral-800 bg-neutral-900 rounded px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition text-sm placeholder:text-neutral-600"
              name="email"
              id="email"
              placeholder="example@gmail.com"
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="password" className="text-sm text-neutral-400">
              Password
            </label>
            <input
              className="border border-neutral-800 bg-neutral-900 rounded px-3 py-2 text-neutral-200 focus:outline-none focus:ring-2 focus:ring-neutral-700 transition text-sm placeholder:text-neutral-600"
              name="password"
              id="password"
              type="password"
              placeholder="Enter your password"
              min={8}
              autoComplete="current-password"
            />
          </div>
          <button
            type="submit"
            className="mt-2 bg-neutral-100 text-neutral-900 rounded px-4 py-2 hover:bg-neutral-200 transition text-sm font-medium"
          >
            Login
          </button>
        </form>
        <div className="text-center text-sm text-neutral-500">
          Don&apos;t have an account?{" "}
          <Link
            href="/register"
            className="text-neutral-300 font-medium hover:underline hover:text-white"
          >
            Register
          </Link>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
