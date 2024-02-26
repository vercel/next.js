import React, { useState } from "react";
import SendOTPForm from "./SendOTPForm";
import VerifyOTPForm from "./VerifyOTPForm";
import StytchContainer from "./StytchContainer";

const LoginWithSMS = () => {
  const [otpSent, setOTPSent] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [methodId, setMethodId] = useState("");

  return (
    <StytchContainer>
      {!otpSent ? (
        <SendOTPForm
          phoneNumber={phoneNumber}
          setMethodId={setMethodId}
          setOTPSent={setOTPSent}
          setPhoneNumber={setPhoneNumber}
        />
      ) : (
        <VerifyOTPForm methodId={methodId} phoneNumber={phoneNumber} />
      )}
    </StytchContainer>
  );
};

export default LoginWithSMS;
