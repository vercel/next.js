import { auth, signIn, signOut } from "@/auth";
import { sendTestEmail } from "@/actions";

function SignIn() {
  return (
    <form
      action={async (formData) => {
        "use server";
        await signIn("nodemailer", formData);
      }}
    >
      <p>Sign in with a magic link sent to your email.</p>
      <input type="email" name="email" placeholder="you@example.com" required />
      <button type="submit">Send magic link</button>
      <p>
        The email is caught by Mailtrap Local — open{" "}
        <a href="http://localhost:3550">http://localhost:3550</a> to read it and
        click the link.
      </p>
    </form>
  );
}

function SignOut({ children }: { children: React.ReactNode }) {
  return (
    <form
      action={async () => {
        "use server";
        await signOut();
      }}
    >
      <p>{children}</p>
      <button type="submit">Sign out</button>
    </form>
  );
}

function SendTestEmail() {
  return (
    <form action={sendTestEmail}>
      <h2>Send a test email</h2>
      <p>
        Send an email straight to Mailtrap Local, then read it at{" "}
        <a href="http://localhost:3550">http://localhost:3550</a>.
      </p>
      <textarea
        name="message"
        rows={3}
        placeholder="Optional message body (defaults to a greeting)"
      />
      <button type="submit">Send test email</button>
    </form>
  );
}

export default async function Page() {
  const session = await auth();
  const user = session?.user?.email;

  return (
    <section>
      <h1>Home</h1>
      <div>{user ? <SignOut>{`Welcome ${user}`}</SignOut> : <SignIn />}</div>
      <hr />
      <SendTestEmail />
    </section>
  );
}
