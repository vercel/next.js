"use client";

const Logo = () => {
  return (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
        cursor: "pointer",
        fontSize: "1.5rem",
      }}
    >
      <svg
        height={36}
        viewBox="0 0 564 671"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M247.36 5.32968L64.026 73.9963C29.026 87.3297 0.359344 128.663 0.359344 166.33V436.33C0.359344 463.33 18.026 498.997 39.6927 514.997L223.027 651.997C255.36 676.33 308.36 676.33 340.693 651.997L524.027 514.997C545.693 498.663 563.36 463.33 563.36 436.33V166.33C563.36 128.996 534.693 87.3293 499.693 74.3293L316.36 5.66301C297.693 -1.67032 266.36 -1.67032 247.36 5.32968Z"
          className="fill-black"
        />
        <path
          d="M365.333 285C365.333 239 328 201.667 282 201.667C236 201.667 198.667 239 198.667 285C198.667 322.333 223.333 353.333 257 364V451.667C257 465.333 268.333 476.667 282 476.667C295.667 476.667 307 465.333 307 451.667V364C340.667 353.333 365.333 322.333 365.333 285Z"
          className="fill-zinc-300"
        />
      </svg>
      <span className="font-medium text-black">iamjs</span>
      <style jsx>{`
        span {
          padding: 0.5rem 0.5rem 0.5rem 0;
          mask-image: linear-gradient(
            60deg,
            black 25%,
            rgba(0, 0, 0, 0.2) 50%,
            black 75%
          );
          mask-size: 400%;
          mask-position: 0%;
        }
        span:hover {
          mask-position: 100%;
          transition: mask-position 1s ease, -webkit-mask-position 1s ease;
        }
      `}</style>
    </span>
  );
};

export default Logo;
