"use client";

import { SessionAuth } from "supertokens-auth-react/recipe/session";

type Props = Parameters<typeof SessionAuth>[0] & {
    children?: React.ReactNode | undefined;
};

export const SessionAuthForNextJS = (props: Props) => {
    if (typeof window === "undefined") {
        return props.children;
    }

    return <SessionAuth {...props}>{props.children}</SessionAuth>;
};
