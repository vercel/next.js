import { cookies, headers } from "next/headers";
import { TryRefreshComponent } from "./tryRefreshClientComponent";
import styles from "../page.module.css";
import { redirect } from "next/navigation";
import Image from "next/image";
import { CelebrateIcon, SeparatorLine } from "../../assets/images";
import { CallAPIButton } from "./callApiButton";
import { LinksComponent } from "./linksComponent";
import { SessionAuthForNextJS } from "./sessionAuthForNextJS";
import { getSSRSession } from "supertokens-node/nextjs";
import { SessionContainer } from "supertokens-node/recipe/session";
import { ensureSuperTokensInit } from "../config/backend";

ensureSuperTokensInit();

async function getSSRSessionHelper(): Promise<{
  session: SessionContainer | undefined;
  hasToken: boolean;
  hasInvalidClaims: boolean;
  error: Error | undefined;
}> {
  let session: SessionContainer | undefined;
  let hasToken = false;
  let hasInvalidClaims = false;
  let error: Error | undefined = undefined;

  try {
    ({ session, hasToken, hasInvalidClaims } = await getSSRSession(
      cookies().getAll(),
      headers(),
    ));
  } catch (err: any) {
    error = err;
  }
  return { session, hasToken, hasInvalidClaims, error };
}

export async function HomePage() {
  const { session, hasToken, hasInvalidClaims, error } =
    await getSSRSessionHelper();

  if (error) {
    return (
      <div>
        Something went wrong while trying to get the session. Error -{" "}
        {error.message}
      </div>
    );
  }

  if (!session) {
    if (!hasToken) {
      /**
       * This means that the user is not logged in. If you want to display some other UI in this
       * case, you can do so here.
       */
      return redirect("/auth");
    }

    if (hasInvalidClaims) {
      return <SessionAuthForNextJS />;
    } else {
      return <TryRefreshComponent />;
    }
  }

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
              {session.getUserId()}
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
