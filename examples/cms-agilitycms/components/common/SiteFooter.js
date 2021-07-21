import React from "react";
import { FaTwitter, FaInstagram, FaSlack, FaYoutube } from "react-icons/fa";

/**
 * This footer is not part of the content in the CMS, feel free to remove this for production use.
 */

const SiteFooter = () => {
  // set up Agility CMS Socials
  const socials = [
    {
      title: "Twitter",
      url: "https://www.twitter.com/agilitycms",
      icon: (
        <FaTwitter className="text-xl md:ml-8 text-primary-500 hover:text-primary-700 transition duration-300" />
      ),
    },
    {
      title: "Instagram",
      url: "https://www.instagram.com/agilitycms",
      icon: (
        <FaInstagram className="text-xl md:ml-8 text-primary-500 hover:text-primary-700 transition duration-300" />
      ),
    },
    {
      title: "Slack",
      url:
        "https://join.slack.com/t/agilitycms-community/shared_invite/zt-99qlv1hw-tpPOJ99V21Y2omtA_uTcJw",
      icon: (
        <FaSlack className="text-xl md:ml-8 text-primary-500 hover:text-primary-700 transition duration-300" />
      ),
    },
    {
      title: "YouTube",
      url: "https://www.youtube.com/channel/UCzKjErx94RLTbJctcrIgsDQ",
      icon: (
        <FaYoutube className="text-xl md:ml-8 text-primary-500 hover:text-primary-700 transition duration-300" />
      ),
    },
  ];

  return (
    <footer className="relative px-8 py-6 md:py-4 mt-8 bg-gray-100">
      <div className="max-w-screen-xl mx-auto md:flex md:items-center">
        <div className="text-center mb-4 md:mb-0 md:text-left flex-shrink-0 relative">
          <a
            href="https://www.agilitycms.com"
            target="_blank"
            title="Agility CMS"
          >
            <img
              src="/assets/agility-logo.svg"
              alt="Agility CMS"
              width="90"
              height="24"
            />
          </a>
        </div>
        <div className="flex-grow mb-4 md:mb-0">
          <p className="text-center md:text-left text-gray-600 text-xs md:ml-8 md:max-w-3xl">
            Powered by Agility CMS. This website and materials found on it are
            for demo purposes. You can use this to preview the content you
            created on your Agility CMS account.{"\u00A0"}
            <a
              href="https://github.com/agility/agilitycms-nextjs-starter"
              title="View on GitHub"
              target="_blank"
              className="text-gray-600 mr-2 border-b border-gray-600"
            >
              GitHub
            </a>
            <a
              href="https://help.agilitycms.com/hc/en-us"
              title="Help Center"
              target="_blank"
              className="text-gray-600 mr-1 border-b border-gray-600"
            >
              Help Center
            </a>
            {"\u00A0"}
            <a
              href="https://agilitycms.com/contact-us/chat-sales"
              title="Contact Us"
              target="_blank"
              className="text-gray-600 border-b border-gray-600"
            >
              Contact Us
            </a>
          </p>
        </div>
        <div className="flex-1-grow">
          <ul className="flex justify-center md:justify-start">
            {socials.map((social, index) => (
              <li key={index} className="mx-4 md:mx-0">
                <a
                  href={social.url}
                  title={`Follow Agility CMS on ${social.title}`}
                  target="_blank"
                >
                  {social.icon}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
};

export default SiteFooter;
