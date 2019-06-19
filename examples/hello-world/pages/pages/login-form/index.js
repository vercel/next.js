import { useState } from "react";
import styled from "styled-components";

import Button from "./../../components/button";
import GoogleIcon from "./google-icon";
import { useFirebase } from "./../../firebase";
import notify from "./../notify";

const Container = styled.div`
  position: relative;
  width: 100%;
  height: 100%;

  form {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100%;
  }

  .mdc-button__label {
    display: flex;
    align-items: center;

    svg {
      height: 14px;
      padding-right: 16px;
    }
  }
`;

const LoginForm = () => {
  const [loading, setLoading] = useState(false);

  const {
    firebaseDB,
    firebaseAuth,
    providers: { google }
  } = useFirebase();

  const onSubmit = async event => {
    event.preventDefault();
    try {
      setLoading(true);
      const socialAuthUser = await firebaseAuth.signInWithPopup(google);
      firebaseDB
        .collection("users")
        .doc(`${socialAuthUser.user.uid}`)
        .set({
          email: socialAuthUser.user.email,
          name: socialAuthUser.user.displayName,
          picture: socialAuthUser.user.photoURL,
          uid: socialAuthUser.user.uid
        });
      setLoading(false);
    } catch (e) {
      setLoading(false);
      notify({
        message: "Couldn't login. Please try again.",
        toastId: "login-error"
      });
      console.log(e);
    }
  };

  return (
    <Container>
      <form onSubmit={onSubmit}>
        <Button raised disabled={loading} type="submit">
          <GoogleIcon />
          Sign in with Google
        </Button>
      </form>
    </Container>
  );
};

export default LoginForm;
