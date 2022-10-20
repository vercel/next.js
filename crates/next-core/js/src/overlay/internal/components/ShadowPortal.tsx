import * as React from "react";
import { createPortal } from "react-dom";

export type ShadowPortalProps = {
  children: React.ReactNode;
  globalOverlay?: boolean;
};

export const ShadowPortal: React.FC<ShadowPortalProps> = function Portal({
  children,
  globalOverlay,
}) {
  const mountNode = React.useRef<HTMLDivElement | null>(null);
  const portalNode = React.useRef<HTMLElement | null>(null);
  const shadowNode = React.useRef<ShadowRoot | null>(null);
  const [, forceUpdate] = React.useState<{} | undefined>();

  React.useLayoutEffect(() => {
    const ownerDocument = globalOverlay
      ? document
      : mountNode.current!.ownerDocument!;
    portalNode.current = ownerDocument.createElement("nextjs-portal");
    shadowNode.current = portalNode.current.attachShadow({ mode: "open" });
    ownerDocument.body.appendChild(portalNode.current);
    forceUpdate({});
    return () => {
      if (portalNode.current && portalNode.current.ownerDocument) {
        portalNode.current.ownerDocument.body.removeChild(portalNode.current);
      }
    };
  }, [globalOverlay]);

  return shadowNode.current ? (
    createPortal(children, shadowNode.current as any)
  ) : globalOverlay ? null : (
    <span ref={mountNode} />
  );
};
