import Image from "next/image";

export default function FooterSection({ mainMenu }) {
  const links = mainMenu.map((link) => ({
    ...link,
    url: link.url[0] === "#" ? `/${link.url}` : link.url,
  }));

  return (
    <footer className="footer pt-120">
      <div className="container">
        <div className="row">
          <div className="col-xl-3 col-lg-4 col-md-6 col-sm-10">
            <div className="footer-widget">
              <div className="logo">
                <a href="https://buttercms.com">
                  <Image
                    width={200}
                    height={50}
                    src="https://cdn.buttercms.com/PBral0NQGmmFzV0uG7Q6"
                    alt="logo"
                  />
                </a>
              </div>
              <p className="desc">
                ButterCMS is your content backend. Build better with Butter.
              </p>
              <ul className="social-links">
                <li>
                  <a href="#0">
                    <i className="lni lni-facebook"></i>
                  </a>
                </li>
                <li>
                  <a href="#0">
                    <i className="lni lni-linkedin"></i>
                  </a>
                </li>
                <li>
                  <a href="#0">
                    <i className="lni lni-instagram"></i>
                  </a>
                </li>
                <li>
                  <a href="#0">
                    <i className="lni lni-twitter"></i>
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="col-xl-5 col-lg-4 col-md-12 col-sm-12 offset-xl-1">
            <div className="footer-widget">
              <h3>About Us</h3>
              <ul className="links">
                {links.map((navLink) => (
                  <li key={navLink.url}>
                    <a href={navLink.url}>{navLink.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="col-xl-3 col-lg-4 col-md-6">
            <div className="footer-widget">
              <h3>Subscribe Newsletter</h3>
              <form action="#">
                <input type="email" placeholder="Email" />
                <button className="main-btn btn-hover">Subscribe</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
