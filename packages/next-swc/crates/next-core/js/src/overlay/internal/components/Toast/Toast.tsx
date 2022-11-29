import * as React from "react";
import { clsx } from "../../helpers/clsx";

export type ToastProps = React.PropsWithChildren & {
  onClick?: (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  className?: string;
};

export function Toast({ onClick, children, className }: ToastProps) {
  return (
    <div onClick={onClick} className={clsx("toast", className)}>
      <div className="toast-wrapper">{children}</div>
    </div>
  );
}
