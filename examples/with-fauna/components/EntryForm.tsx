"use client";

import cn from "classnames";
import { createEntryAction } from "@/actions/entry";
// @ts-ignore
import { useActionState } from "react";
// @ts-ignore
import { useFormStatus } from "react-dom";
import LoadingSpinner from "@/components/LoadingSpinner";
import SuccessMessage from "@/components/SuccessMessage";
import ErrorMessage from "@/components/ErrorMessage";

const inputClasses = cn(
  "block py-2 bg-white dark:bg-gray-800",
  "rounded-md border-gray-300 focus:ring-blue-500",
  "focus:border-blue-500 text-gray-900 dark:text-gray-100",
);

const initialState = {
  successMessage: null,
  errorMessage: null,
};

export default function EntryForm() {
  // useActionState is available with React 19 (Next.js App Router)
  const [state, formAction] = useActionState(createEntryAction, initialState);
  const { pending } = useFormStatus();

  return (
    <>
      <form className="relative flex my-4" action={formAction}>
        <input
          required
          className={cn(inputClasses, "w-1/3 mr-2 px-4")}
          aria-label="Your name"
          placeholder="Your name..."
          name="name"
        />
        <input
          required
          className={cn(inputClasses, "pl-4 pr-32 flex-grow")}
          aria-label="Your message"
          placeholder="Your message..."
          name="message"
        />
        <button
          className={cn(
            "flex items-center justify-center",
            "absolute right-1 top-1 px-4 font-bold h-8",
            "bg-gray-100 dark:bg-gray-700 text-gray-900",
            "dark:text-gray-100 rounded w-28",
          )}
          type="submit"
          disabled={pending}
        >
          {pending ? <LoadingSpinner /> : "Sign"}
        </button>
      </form>
      {state?.successMessage ? (
        <SuccessMessage>{state.successMessage}</SuccessMessage>
      ) : null}
      {state?.errorMessage ? (
        <ErrorMessage>{state.errorMessage}</ErrorMessage>
      ) : null}
    </>
  );
}
