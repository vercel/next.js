"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { useEffect, useState } from "react";
import styles from "../styles/Home.module.css";
import "../styles/prism.css";

declare global {
  interface Window {
    Prism: any;
  }
}

const apiSample = `import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { userId, sessionId } = auth()
  if(!sessionId) {
    return NextResponse.json({ id: null }, { status: 401 })
  }
  return NextResponse.json({ id: userId }, { status: 200 })
}`;

export const APIRequest = () => {
  useEffect(() => {
    if (window.Prism) {
      window.Prism.highlightAll();
    }
  });

  const [response, setResponse] = useState("// Click above to run the request");

  const makeRequest = async () => {
    setResponse("// Loading...");

    try {
      const res = await fetch("/api/getAuthenticatedUserId");
      const body = await res.json();
      setResponse(JSON.stringify(body, null, "  "));
    } catch (e) {
      setResponse(
        "// There was an error with the request. Please contact support@clerk.dev",
      );
    }
  };

  return (
    <div className={styles.backend}>
      <h2>API request example</h2>
      <div className={styles.card}>
        <button
          rel="noreferrer"
          className={styles.cardContent}
          onClick={() => makeRequest()}
        >
          <img src="/icons/server.svg" />
          <div>
            <h3>fetch('/api/getAuthenticatedUserId')</h3>
            <p>
              Retrieve the user ID of the signed in user, or null if there is no
              user
            </p>
          </div>
          <div className={styles.arrow}>
            <img src="/icons/download.svg" />
          </div>
        </button>
      </div>
      <h4>
        Response
        <em>
          <SignedIn>
            You are signed in, so the request will return your user ID
          </SignedIn>
          <SignedOut>
            You are signed out, so the request will return null
          </SignedOut>
        </em>
      </h4>
      <pre>
        <code className="language-js">{response}</code>
      </pre>
      <h4>app/api/getAuthenticatedUserId/route.ts</h4>
      <pre>
        <code className="language-js">{apiSample}</code>
      </pre>
    </div>
  );
};
