import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SubmitButton } from "../../components/forms/submit-button";
import { Label } from "@/components/forms/label";
import { Input } from "@/components/forms/input";
import { FormMessage, Message } from "@/components/forms/form-message";
import { encodedRedirect } from "@/utils/utils";

export default function Login({ searchParams }: { searchParams: Message }) {
  const signIn = async (formData: FormData) => {
    "use server";

    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const supabase = createClient();

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return encodedRedirect("error", "/login", "Could not authenticate user");
    }

    return redirect("/protected");
  };

  return (
    <div className="flex flex-col flex-1 p-4 w-full items-center">
      <Link
        href="/"
        className="absolute left-8 top-8 py-2 px-4 rounded-md no-underline text-foreground bg-btn-background hover:bg-btn-background-hover flex items-center group text-sm"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="mr-2 h-4 w-4 transition-transform group-hover:-translate-x-1"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>{" "}
        Back
      </Link>

      <form className="flex-1 flex flex-col w-full justify-center gap-2 text-foreground [&>input]:mb-6 max-w-md p-4">
        <h1 className="text-2xl font-medium">Log in</h1>
        <p className="text-sm text-foreground/60">
          Don't have an account?{" "}
          <Link className="text-blue-600 font-medium underline" href="/signup">
            Sign up
          </Link>
        </p>
        <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
          <Label htmlFor="email">Email</Label>
          <Input name="email" placeholder="you@example.com" required />
          <div className="flex justify-between items-center">
            <Label htmlFor="password">Password</Label>

            <Link
              className="text-sm text-blue-600 underline"
              href="/forgot-password"
            >
              Forgot Password?
            </Link>
          </div>
          <Input
            type="password"
            name="password"
            placeholder="••••••••"
            required
          />
          <SubmitButton formAction={signIn} pendingText="Signing In...">
            Log in
          </SubmitButton>
          <FormMessage message={searchParams} />
        </div>
      </form>
    </div>
  );
}
