import { useEffect, useRef } from "react";
import { gsap } from "gsap";

type TitleProps = {
  lineContent: string;
  lineContent2: string;
};

export default function Title({ lineContent, lineContent2 }: TitleProps) {
  let line1 = useRef(null);
  let line2 = useRef(null);

  useEffect(() => {
    gsap.from([line1.current, line2.current], 0.8, {
      delay: 0.8,
      ease: "power3.out",
      y: 64,
      stagger: {
        amount: 0.15,
      },
    });
  }, [line1, line2]);

  return (
    <h1 className="page-title">
      <div className="line-wrap">
        <div ref={line1} className="line">
          {lineContent}
        </div>
      </div>
      <div className="line-wrap">
        <div ref={line2} className="line">
          {lineContent2}
        </div>
      </div>
    </h1>
  );
}
