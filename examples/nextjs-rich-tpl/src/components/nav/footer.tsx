"use client";

import Link from "next/link";
import React from "react";
import config from "../../../richtpl.config";
import { FaGithub, FaTwitter } from "react-icons/fa";
import LanguageSelest from "../ui/LanguageSelest";
import { TLink } from "../ui/Tcomps";
import { useTranslations } from "next-intl";

function Footer() {
  const t = useTranslations("Footer");

  function Logo() {
    return (
      <>
        {config.themeConfig.footer?.logo?.type === "Vercel" ? (
          <>
            <svg
              className="fill-neutral-900 dark:fill-neutral-100"
              height={20}
              viewBox="0 0 283 64"
            >
              <path d="M141.04 16c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.46 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zM248.72 16c-11.04 0-19 7.2-19 18s8.96 18 20 18c6.67 0 12.55-2.64 16.19-7.09l-7.65-4.42c-2.02 2.21-5.09 3.5-8.54 3.5-4.79 0-8.86-2.5-10.37-6.5h28.02c.22-1.12.35-2.28.35-3.5 0-10.79-7.96-17.99-19-17.99zm-9.45 14.5c1.25-3.99 4.67-6.5 9.45-6.5 4.79 0 8.21 2.51 9.45 6.5h-18.9zM200.24 34c0 6 3.92 10 10 10 4.12 0 7.21-1.87 8.8-4.92l7.68 4.43c-3.18 5.3-9.14 8.49-16.48 8.49-11.05 0-19-7.2-19-18s7.96-18 19-18c7.34 0 13.29 3.19 16.48 8.49l-7.68 4.43c-1.59-3.05-4.68-4.92-8.8-4.92-6.07 0-10 4-10 10zm82.48-29v46h-9V5h9zM36.95 0L73.9 64H0L36.95 0zm92.38 5l-27.71 48L73.91 5H84.3l17.32 30 17.32-30h10.39zm58.91 12v9.69c-1-.29-2.06-.49-3.2-.49-5.81 0-10 4-10 10V51h-9V17h9v9.2c0-5.08 5.91-9.2 13.2-9.2z" />
            </svg>
            <span className="hidden">Vercel</span>
          </>
        ) : (
          config.themeConfig.footer?.logo?.content || (
            <h1 className="text-2xl font-bold">
              {config.themeConfig.footer?.logo?.i18n
                ? t(config.themeConfig.footer?.title)
                : config.themeConfig.footer?.title}
            </h1>
          )
        )}
      </>
    );
  }

  function SocialButtons() {
    return (
      <>
        {config.themeConfig.footer?.social?.github && (
          <Link
            href={`https://github.com/${config.organizationName}/${config.projectName}`}
            target="block"
            aria-label="GitHub"
          >
            <FaGithub />
            <span className="hidden">GitHub</span>
          </Link>
        )}
        {config.themeConfig.footer?.social?.twitter && (
          <>
            <hr className="flex border-0 w-[1px] h-[19px] bg-neutral-700 dark:bg-neutral-500" />
            <Link
              href={`https://twitter.com/${config.themeConfig.footer?.social?.twitter}`}
              target="block"
              aria-label="Twitter"
            >
              <FaTwitter />
              <span className="hidden">Twitter</span>
            </Link>
          </>
        )}
      </>
    );
  }

  return (
    <footer className="w-full mx-auto overflow-hidden border-t border-t-neutral-200 dark:border-t-neutral-800 text-neutral-500 dark:text-neutral-400">
      <div className="max-w-full w-[calc(1200px+calc(2*24px))] mx-auto px-6">
        <div className="min-h-[400px] py-9">
          <div className="grid gap-8 grid-cols-[repeat(auto-fill,minmax(140px,1fr))] lg:flex flex-wrap justify-between">
            <div className="flex flex-row justify-between items-center lg:items-stretch col-span-full">
              {config.themeConfig.footer?.logo?.href ? (
                <Link
                  href={config.themeConfig.footer?.logo?.href}
                  aria-label="Logo"
                >
                  <Logo />
                </Link>
              ) : (
                <Logo />
              )}
              <div className="lg:hidden flex flex-row justify-start items-center gap-3">
                <SocialButtons />
              </div>
            </div>

            {config.themeConfig.footer?.items?.map((group, idx) => (
              <div key={idx} className="flex flex-col">
                <h2 className="text-sm font-semibold mb-4 text-neutral-800 dark:text-neutral-200">
                  {group.title_i18n ? t(`items.${group.title}`) : group.title}
                </h2>
                {group.contents?.map((link, idx2) => (
                  <TLink
                    key={idx2}
                    target={link.target}
                    href={link.href}
                    to={link.to}
                    i18n_link={link.i18n_link || false}
                    i18n_text={link.i18n_text || false}
                    className="text-sm font-base w-fit mb-3 hover:text-neutral-800 dark:hover:text-neutral-200 transition-all duration-300 ease-in-out"
                    i18n_path="Footer.items"
                  >
                    {link.label}
                  </TLink>
                ))}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap flex-row justify-between items-center gap-2 mt-12 mb-0 text-sm">
            <div className="flex flex-col justify-start items-stretch gap-4">
              <p className="">
                {config.themeConfig.footer?.footerText?.i18n
                  ? t(`footerText`)
                  : config.themeConfig.footer?.footerText?.text ||
                    "Copyright © 2024 Fun117. All rights reserved."}
              </p>
              <div className="hidden lg:flex flex-row justify-start items-center gap-3 w-fit">
                <SocialButtons />
              </div>
            </div>
            <LanguageSelest />
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
