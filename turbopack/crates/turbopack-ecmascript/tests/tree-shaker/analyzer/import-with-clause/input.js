import { createTransition } from "./transition" with {
    "turbopack-transition": "next-ssr"
};

export function useTransition() {
    return createTransition();
}
