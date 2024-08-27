"use client";

import { useFormStatus } from "react-dom";
import { type ComponentProps } from "react";

type Props = ComponentProps<"button"> & {
  pendingText?: string;
};

export function SubmitButton({
  children,
  pendingText = "Submitting...",
  ...props
}: Props) {
  const { pending, action } = useFormStatus();

  const isPending = pending && action === props.formAction;

  return (
    <button
      {...props}
      className="bg-black h-8 flex items-center justify-center font-medium text-sm hover:bg-slate-800 transition-colors text-white rounded-md text-foreground"
      type="submit"
      aria-disabled={pending}
    >
      {isPending ? pendingText : children}
    </button>
  );
}
