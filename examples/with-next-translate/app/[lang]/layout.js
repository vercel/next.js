import useTranslation from "next-translate/useTranslation";

export default function LangLayout({ children }) {
  const { t } = useTranslation("common");

  return (
    <>
      {children}
      <footer>
        <span>{t("powered")} </span>
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
          ▲ Vercel
        </a>
        <span>&amp;</span>
        <a
          href="https://github.com/vinissimus/next-translate"
          target="_blank"
          rel="noopener noreferrer"
        >
          next-translate
        </a>
      </footer>
    </>
  );
}
