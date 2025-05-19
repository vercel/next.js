// src/app/login/page.js
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useSignInEmailPassword, useSignOut } from "@nhost/react";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const useSignInEmailPasswordData = useSignInEmailPassword();
  const { signOut } = useSignOut()

  const {
    signInEmailPassword,
    isLoading,
    isSuccess,
    isError,
    error,
    needsEmailVerification, // This can be true if the user hasn't verified their email yet
  } = useSignInEmailPasswordData;

  // console.log("useSignInEmailPasswordData", useSignInEmailPasswordData);

  const handleLogin = async (e) => {
    e.preventDefault();
    console.log("email, password", email, password);
    const resp = await signInEmailPassword(email, password);
    console.log("resp", resp);

    if (resp.isError) {
      alert(resp.error.message);
    }
  };

  useEffect(() => {
    if (isSuccess) {
      if (needsEmailVerification) {
        // This state means the login was successful but the user's email is not yet verified.
        // You might want to redirect them to a page explaining they need to verify their email,
        // or show a persistent message.
        alert(
          "Login successful, but your email needs verification. Please check your inbox.",
        );
        // router.push('/verify-email-notice'); // Or similar
        // Or, if you allow login with unverified email for some period/features:
        // router.push("/");
      } else {
        // Login successful and email is verified (or verification wasn't required for this login path)
        // router.push("/");
      }
    }
  }, [isSuccess, needsEmailVerification, router]);

  useEffect(() => {
    if (isError && error) {
      console.error("Login error:", error);
      alert(`Login failed: ${error.message || "Invalid email or password."}`);
    }
  }, [isError, error]);

  return (
    <div>
      <h1>Login</h1>
      <pre>{JSON.stringify(useSignInEmailPasswordData, undefined, 2)}</pre>
      <form onSubmit={handleLogin}>
        <div>
          <input
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <input
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={isLoading}
          />
        </div>
        <div>
          <button type="submit" disabled={isLoading}>
            {isLoading ? "Logging in..." : "Login"}
          </button>
        </div>
      </form>

      {isError && error && (
        <p style={{ color: "red" }}>
          Error: {error.message || "An unknown error occurred."}
        </p>
      )}
      {needsEmailVerification && isSuccess && (
        <p style={{ color: "orange" }}>
          Login successful. Please check your email ({email}) to verify your
          account before full access.
        </p>
      )}

      <div>
        <p>
          Don't have an account? <Link href="/register">Register here</Link>
        </p>

        <p>
          Go to <Link href="/">index</Link>
        </p>

        <button onClick={() => signOut()}>Sign Out</button>
      </div>
    </div>
  );
}
