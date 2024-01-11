import React from "react";
import styles from "../styles/Home.module.css";
import { LoginMethod } from "../lib/types";
import StytchContainer from "./StytchContainer";

type Props = {
  setLoginMethod: (loginMethod: LoginMethod) => void;
};

const LoginEntryPoint = (props: Props) => {
  const { setLoginMethod } = props;
  return (
    <StytchContainer>
      <h2>Hello Vercel!</h2>
      <p className={styles.entrySubHeader}>
        This example app demonstrates how you can integrate with Stytch using
        Next.js and deploy on Vercel. Now, let’s get started!
      </p>
      <button
        className={styles.entryButton}
        onClick={() => setLoginMethod(LoginMethod.SDK)}
      >
        SDK Integration (Email magic links)
      </button>
      <button
        className={styles.entryButton}
        onClick={() => setLoginMethod(LoginMethod.API)}
      >
        API Integration (SMS Passcodes)
      </button>
    </StytchContainer>
  );
};

export default LoginEntryPoint;
