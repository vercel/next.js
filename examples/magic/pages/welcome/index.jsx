import React, { useCallback, useState } from "react";

import { Magic } from "magic-sdk"

const Welcome = ({MAGICTESPUBLICKEY}) => {
  const [disabled, setDisabled] = useState(false);
  const handleSubmit = useCallback(
    async (e) => {
      e.preventDefault();
      setDisabled(true);
      const elements = e.currentTarget.elements;
      const email = elements.email.value;
      if (email) {
        const magic = new Magic(MAGICTESPUBLICKEY);
        const didToken = await magic.auth.loginWithMagicLink({ email });
        const serverUrl = window.location.origin;
        const result = await fetch(`${serverUrl}/api/magic/login`, {
          headers: new Headers({
            Authorization: "Bearer " + didToken
          }),
          credentials: "same-origin",
          method: "POST"
        });
        if (result.status === 200) {
          window.location.replace("/");
        }
      }
    },
    []
  );
  return (
    <>
        <div className="welcome">
            <form onSubmit={handleSubmit}>
              <input
                readOnly={disabled}
                type="email"
                name="email"
                placeholder="Enter your email"
              />
              <button disabled={disabled} type="submit">
                SignUp \ Login
              </button>
            </form>
        </div>
      <style jsx>{`
        .welcome {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
        }
      `}</style>
    </>
  );
};

Welcome.getInitialProps = async () => {
  return {MAGICTESPUBLICKEY: process.env.MAGICTESPUBLICKEY}
}

export default Welcome;
