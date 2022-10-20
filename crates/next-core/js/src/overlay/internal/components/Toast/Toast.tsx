import * as React from "react";

export type ToastProps = React.PropsWithChildren & {
  onClick?: (ev: React.MouseEvent<HTMLDivElement, MouseEvent>) => void;
  className?: string;
};

export const Toast: React.FC<ToastProps> = function Toast({
  onClick,
  children,
  className,
}) {
  return (
    <div data-nextjs-toast onClick={onClick} className={className}>
      <div data-nextjs-toast-wrapper>{children}</div>
    </div>
  );
};
