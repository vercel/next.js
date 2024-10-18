"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";

const modules_list = [
  {
    label: "Next.js",
    href: "https://nextjs.org/",
  },
  {
    label: "next-intl",
    href: "https://next-intl-docs.vercel.app/",
  },
  {
    label: "next-themes",
    href: "https://github.com/pacocoursey/next-themes",
  },
  {
    label: "Tailwind CSS",
    href: "https://tailwindcss.com/",
  },
  {
    label: "Framer Motion",
    href: "https://www.framer.com/motion/",
  },
  {
    label: "Autoprefixer",
    href: "https://github.com/postcss/autoprefixer",
  },
  {
    label: "Lucide Icons",
    href: "https://lucide.dev/",
  },
];

export default function PageClientAbout() {
  const t = useTranslations("PageAbout");

  return (
    <div className="relative flex flex-col items-center justify-between container min-h-[calc(100vh-64px)] p-2 md:p-8 lg:p-24 xl:p-36">
      <div className="w-full h-full p-5">
        <h1 className="text-3xl font-bold">{t("About This Project.title")}</h1>
        <p className="text-base font-medium mt-4">
          {t("About This Project.description")}
        </p>

        <h2 className="text-2xl font-semibold mt-8">
          {t("Project Details.title")}
        </h2>
        <p className="text-base font-medium mt-4">
          {t("Project Details.description")}
        </p>
        <ul className="list-disc list-inside mt-4 text-base font-medium">
          <li>{t("Localization with next-intl")}</li>
          <li>{t("Dark mode support with next-themes")}</li>
          <li>{t("Responsive design with Tailwind CSS")}</li>
          <li>{t("Optimized performance with modern web standards")}</li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8">
          {t("Contributors.title")}
        </h2>
        <p className="text-base font-medium mt-4">
          {t("Contributors.description")}
        </p>
        <ul className="list-disc list-inside mt-4 text-base font-medium">
          <li>
            <Link
              href="https://fun117.dev"
              className="text-blue-600 dark:text-blue-500 hover:underline"
              target="_block"
            >
              Fun117
            </Link>{" "}
            - {t("Project Lead")}
          </li>
        </ul>

        <h2 className="text-2xl font-semibold mt-8">
          {t("Modules & Packages Used")}
        </h2>
        <ul className="list-disc list-inside mt-4 text-base font-medium">
          {modules_list.map((module, idx) => (
            <li key={idx}>
              <Link
                href={module.href}
                className="text-blue-600 dark:text-blue-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                {module.label}
              </Link>
            </li>
          ))}
        </ul>

        <h2 className="text-2xl font-semibold mt-8">
          {t("Acknowledgments.title")}
        </h2>
        <p className="text-base font-medium mt-4">
          {t("Acknowledgments.description")}
        </p>

        <h2 className="text-2xl font-semibold mt-8">
          {t("Call for Contributions.title")}
        </h2>
        <p className="text-base font-medium mt-4">
          {t("Call for Contributions.description")}
        </p>

        <h2 className="text-2xl font-semibold mt-8">{t("Contact.title")}</h2>
        <p className="text-base font-medium mt-4">
          {t(
            "Contact.For any inquiries or contributions, please reach out to us via our.text_1",
          )}
          <a
            href="https://github.com/fun117/nextjs-rich-tpl"
            className="text-blue-600 dark:text-blue-500 hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t(
              "Contact.For any inquiries or contributions, please reach out to us via our.text_2",
            )}
          </a>
          {t(
            "Contact.For any inquiries or contributions, please reach out to us via our.text_3",
          )}
        </p>
      </div>
    </div>
  );
}
