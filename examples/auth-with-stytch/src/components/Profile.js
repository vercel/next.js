import React from "react";
import { useStytch, useStytchSession, useStytchUser } from "@stytch/nextjs";

/*
The Profile component is shown to a user that is logged in.

This component renders the full User and Session object for education. 

This component also includes a log out button which is accomplished by making a method call to revoking the existing session
*/
const Profile = () => {
  const stytch = useStytch();
  // Get the Stytch User object if available
  const { user } = useStytchUser();
  // Get the Stytch Session object if available
  const { session } = useStytchSession();

  return (
    <div className="card">
      <h1>Profile</h1>
      <h2>User object</h2>
      <pre className="code-block">
        <code>{JSON.stringify(user, null, 2)}</code>
      </pre>

      <h2>Session object</h2>
      <pre className="code-block">
        <code>{JSON.stringify(session, null, 2)}</code>
      </pre>
      <p>
        You are logged in, and a Session has been created. The SDK stores the
        Session as a token and a JWT in the browser cookies as{" "}
        <span className="code">stytch_session</span> and{" "}
        <span className="code">stytch_session_jwt</span> respectively.
      </p>
      {/* Revoking the session results in the session being revoked and cleared from browser storage. The user will return to Login.js */}
      <button className="primary" onClick={() => stytch.session.revoke()}>
        Log out
      </button>
    </div>
  );
};

export default Profile;
