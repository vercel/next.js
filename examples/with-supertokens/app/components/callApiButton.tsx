"use client";

import Session from "supertokens-auth-react/recipe/session";
import styles from "../page.module.css";

export const CallAPIButton = () => {
  const fetchUserData = async () => {
    const accessToken = await Session.getAccessToken();
    const userInfoResponse = await fetch("http://localhost:3000/api/user", {
      headers: {
        Authorization: "Bearer " + accessToken,
      },
    });

    alert(JSON.stringify(await userInfoResponse.json()));
  };

  return (
    <div onClick={fetchUserData} className={styles.sessionButton}>
      Call API
    </div>
  );
};
