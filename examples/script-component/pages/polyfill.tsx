import { useEffect, useRef, useState } from "react";
import Script from "next/script";

import s from "../styles/polyfill.module.css";

export default function Polyfill() {
  const ref = useRef<HTMLSpanElement>(null);
  const [lastIntersection, setIntersection] = useState(new Date());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (intersections) => {
        const isIntersecting = intersections[0]?.isIntersecting;

        if (isIntersecting) {
          setIntersection(new Date());
        }
      },
      {
        rootMargin: "45px",
      },
    );

    if (ref.current) {
      observer.observe(ref.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <>
      {/* We ensure that intersection observer is available by polyfilling it */}
      <Script
        src="https://polyfill.io/v3/polyfill.min.js?features=IntersectionObserverEntry%2CIntersectionObserver"
        strategy="beforeInteractive"
      />

      <main className={s.container}>
        <h1>IntersectionObserver Polyfill</h1>
        <h5>Scroll down to see when was the last intersection</h5>
        <section className={s.section}>
          <span ref={ref}>
            Last intersection at {lastIntersection.toTimeString()}
          </span>
        </section>
      </main>
    </>
  );
}
