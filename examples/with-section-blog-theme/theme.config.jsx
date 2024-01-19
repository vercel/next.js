const themeConfig = {
  settings: {
    title: "Start your blog or portfolio using MDX, Next.Js, and Nextra.",
    description: "Section blog theme is build with Nextjs and tailwind css.",
    SiteURL: "https://officialrajdeepsingh.github.io/section-blog-theme-demo/",
    defaultSEO: {
      title: "Start your blog or portfolio using MDX, Next.Js, and Nextra.",
      titleTemplate: "%s | Section Blog Theme",
      twitter: {
        handle: "@FrontendWeb3",
        site: "FrontendWeb3",
        cardType: "summary_large_image",
      },
    },
  },
  SocialLinks: [
    {
      name: "github",
      url: "https://github.com/frontendweb3/section-theme-blog",
    },
    {
      name: "twitter",
      url: "https://twitter.com/frontendweb3",
    },
  ],
  Logo: {
    logo: (
      <>
        <svg
          width="36"
          height="36"
          viewBox="0 0 434 420"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            clipRule="evenodd"
            fill="currentColor"
            d="M226.569 66.5458C222.348 59.1514 211.686 59.1514 207.464 66.5458L63.4636 318.753C59.2767 326.086 64.5719 335.207 73.0163 335.207H361.018C369.462 335.207 374.757 326.086 370.57 318.753L226.569 66.5458ZM217.017 270.333C235.355 270.333 250.221 256.557 250.221 239.563C250.221 222.57 235.355 208.793 217.017 208.793C198.679 208.793 183.813 222.57 183.813 239.563C183.813 256.557 198.679 270.333 217.017 270.333Z"
          />
        </svg>
        <span aria-label="logo" className="ml-3">
          Rajdeep Singh.
        </span>
      </>
    ),
    target: "_self",
  },
  PrimaryNavigation: [
    {
      href: "/",
      title: "Home",
    },
    {
      href: "/posts",
      title: "Blog",
    },
    {
      href: "/about",
      title: "About",
    },
    {
      href: "/contact",
      title: "Contact",
    },
  ],
  SecondaryNavigation: [
    {
      href: "https://officialrajdeepsingh.dev/pages/disclaimer",
      title: "Disclaimer",
    },
    {
      href: "https://officialrajdeepsingh.dev/pages/privacy-policy",
      title: "Privacy Policy",
    },
    {
      href: "https://github.com/frontendweb3",
      title: "Frontend Web",
    },
  ],
};
export default themeConfig;
