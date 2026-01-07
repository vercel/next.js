import { cookies } from "next/headers";
import { TryRefreshComponent } from "./tryRefreshClientComponent";
import styles from "../page.module.css";
import { redirect } from "next/navigation";
import Image from "next/image";
import { CelebrateIcon, SeparatorLine } from "../../assets/images";
import { CallAPIButton } from "./callApiButton";
import { LinksComponent } from "./linksComponent";
import { SessionAuthForNextJS } from "./sessionAuthForNextJS";
import jwksClient from "jwks-rsa";
import JsonWebToken from "jsonwebtoken";
import type { JwtHeader, JwtPayload, SigningKeyCallback } from "jsonwebtoken";
import { appInfo } from "../config/appInfo";

const client = jwksClient({
  jwksUri: `${appInfo.apiDomain}${appInfo.apiBasePath}/jwt/jwks.json`,
});

function getAccessToken(): string | undefined {
  return cookies().get("sAccessToken")?.value;
}

function getPublicKey(header: JwtHeader, callback: SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) {
      callback(err);
    } else {
      const signingKey = key?.getPublicKey();
      callback(null, signingKey);
    }
  });
}

async function verifyToken(token: string): Promise<JwtPayload> {
  return new Promise((resolve, reject) => {
    JsonWebToken.verify(token, getPublicKey, {}, (err, decoded) => {
      if (err) {
        reject(err);
      } else {
        resolve(decoded as JwtPayload);
      }
    });
  });
}

/**
 * A helper function to retrieve session details on the server side.
 *
 * NOTE: This function does not use the getSSRSession function from the supertokens-node SDK
 * because getSession can update the access token. These updated tokens would not be
 * propagated to the client side, as request interceptors do not run on the server side.
 */
async function getSSRSessionHelper(): Promise<{
  accessTokenPayload: JwtPayload | undefined;
  hasToken: boolean;
  error: Error | undefined;
}> {
  const accessToken = getAccessToken();
  const hasToken = !!accessToken;
  try {
    if (accessToken) {
      const decoded = await verifyToken(accessToken);
      return { accessTokenPayload: decoded, hasToken, error: undefined };
    }
    return { accessTokenPayload: undefined, hasToken, error: undefined };
  } catch (error) {
    if (error instanceof JsonWebToken.TokenExpiredError) {
      return { accessTokenPayload: undefined, hasToken, error: undefined };
    }
    return { accessTokenPayload: undefined, hasToken, error: error as Error };
  }
}

export async function HomePage() {
  const { accessTokenPayload, hasToken, error } = await getSSRSessionHelper();

  if (error) {
    return (
      <div>
        Something went wrong while trying to get the session. Error -{" "}
        {error.message}
      </div>
    );
  }

  // `accessTokenPayload` will be undefined if it the session does not exist or has expired
  if (accessTokenPayload === undefined) {
    if (!hasToken) {
      /**
       * This means that the user is not logged in. If you want to display some other UI in this
       * case, you can do so here.
       */
      return redirect("/auth");
    }

    /**
     * This means that the session does not exist but we have session tokens for the user. In this case
     * the `TryRefreshComponent` will try to refresh the session.
     *
     * To learn about why the 'key' attribute is required refer to: https://github.com/supertokens/supertokens-node/issues/826#issuecomment-2092144048
     */
    return <TryRefreshComponent key={Date.now()} />;
  }

  /**
   * SessionAuthForNextJS will handle proper redirection for the user based on the different session states.
   * It will redirect to the login page if the session does not exist etc.
   */
  return (
    <SessionAuthForNextJS>
      <div className={styles.homeContainer}>
        <div className={styles.mainContainer}>
          <div
            className={`${styles.topBand} ${styles.successTitle} ${styles.bold500}`}
          >
            <Image
              src={CelebrateIcon}
              alt="Login successful"
              className={styles.successIcon}
            />{" "}
            Login successful
          </div>
          <div className={styles.innerContent}>
            <div>Your userID is:</div>
            <div className={`${styles.truncate} ${styles.userId}`}>
              {accessTokenPayload.sub}
            </div>
            <CallAPIButton />
          </div>
        </div>
        <LinksComponent />
        <Image
          className={styles.separatorLine}
          src={SeparatorLine}
          alt="separator"
        />
      </div>
    </SessionAuthForNextJS>
  );
}
