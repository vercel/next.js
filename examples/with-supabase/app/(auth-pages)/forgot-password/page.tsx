import Link from "next/link";
import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";
import { SubmitButton } from "@/components/submit-button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { FormMessage, Message } from "@/components/form-message";
import { headers } from "next/headers";
import { encodedRedirect } from "@/utils/utils";

export default function ForgotPassword({
  searchParams,
}: {
  searchParams: Message;
}) {
  const forgotPassword = async (formData: FormData) => {
    "use server";

    const email = formData.get("email")?.toString();
    const supabase = createClient();
    const origin = headers().get("origin");
    const callbackUrl = formData.get("callbackUrl")?.toString();

    if (!email) {
      return encodedRedirect("error", "/forgot-password", "Email is required");
    }

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?redirect_to=/protected/reset-password`,
    });

    if (error) {
      console.error(error.message);
      return encodedRedirect(
        "error",
        "/forgot-password",
        "Could not reset password",
      );
    }

    if (callbackUrl) {
      return redirect(callbackUrl);
    }

    return encodedRedirect(
      "success",
      "/forgot-password",
      "Check your email for a link to reset your password.",
    );
  };

  return (
    <form className="flex-1 flex flex-col w-full gap-2 text-foreground [&>input]:mb-6 min-w-64 max-w-64">
      <div>
        <h1 className="text-2xl font-medium">Reset Password</h1>
        <p className="text-sm text-foreground/60">
          Already have an account?{" "}
          <Link className="text-primary underline" href="/login">
            Log in
          </Link>
        </p>
      </div>
      <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
        <Label htmlFor="email">Email</Label>
        <Input name="email" placeholder="you@example.com" required />
        <SubmitButton formAction={forgotPassword}>Reset Password</SubmitButton>
        <FormMessage message={searchParams} />
      </div>
    </form>
  );
}
