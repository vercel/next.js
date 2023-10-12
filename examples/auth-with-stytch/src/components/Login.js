import React from "react";
import { StytchLogin } from "@stytch/nextjs";
import { Products } from "@stytch/vanilla-js";

/*
Login configures and renders the StytchLogin component which is a prebuilt UI component for auth powered by Stytch

This component accepts style, config, and callbacks props. To learn more about possible options review the documentation at
https://stytch.com/docs/sdks/javascript-sdk#ui-configs
*/
const Login = () => {
  const styles = {
    container: {
      width: "100%",
    },
    buttons: {
      primary: {
        backgroundColor: "#4A37BE",
        borderColor: "#4A37BE",
      },
    },
  };

  const REDIRECT_URL = "http://localhost:3000/authenticate";

  const config = {
    products: [Products.emailMagicLinks, Products.oauth],
    emailMagicLinksOptions: {
      loginRedirectURL: REDIRECT_URL,
      loginExpirationMinutes: 60,
      signupRedirectURL: REDIRECT_URL,
      signupExpirationMinutes: 60,
    },
    oauthOptions: {
      providers: [{ type: "google" }],
      loginRedirectURL: REDIRECT_URL,
      signupRedirectURL: REDIRECT_URL,
    },
  };

  return <StytchLogin config={config} styles={styles} />;
};

export default Login;
