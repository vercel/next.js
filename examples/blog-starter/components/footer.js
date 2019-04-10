function Footer() {
  return (
    <>
      <footer>
        <div className="footer-wrap">
          <h2>About</h2>
          <p>
            Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do
            eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim
            ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut
            aliquip ex ea commodo consequat.
          </p>
          <img
            src="/static/_jolvera-avatar.jpg"
            alt="Photo of my Twitter avatar"
          />
          <p className="copy">
            &copy; {new Date().getFullYear()}, Proudly built with{" "}
            <a href="https://nextjs.org">Next.js</a> -{" "}
            <a href="https://github.com/j0lv3r4/nextjs-blog-starter">
              Source code
            </a>
          </p>
        </div>
      </footer>
      <style jsx>{`
        footer {
          padding-top: 3rem;
          padding-bottom: 3rem;
        }

        .footer-wrap {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr 1fr;
          grid-template-rows: auto;
          grid-gap: 1rem;
          max-width: 38rem;
          margin: 0 auto;
        }

        h2 {
          margin-top: 0;
          grid-column: 1 / 4;
          grid-row: 1;
        }

        p {
          grid-column: 1 / 4;
          grid-row: 2;
        }

        img {
          display: flex;
          grid-column: 4 / 5;
          grid-row: 1 / 4;
          border-radius: 50%;
          max-width: 8rem;
          align-self: center;
          justify-self: center;
        }

        .copy {
          margin-bottom: 0;
          grid-column: 1 / 5;
          grid-row: 3;
        }
      `}</style>
    </>
  );
}

export default Footer;
