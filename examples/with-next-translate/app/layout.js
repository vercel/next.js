import useTranslation from "next-translate/useTranslation";
import "./style.css";

export const metadata = {
  title: "Next.js",
};

export default function Layout(props) {
  const { t } = useTranslation();

  return (
    <div className="container">
      {props.children}
      <footer>
        <span>{t("common:powered")} </span>
        <a href="https://vercel.com" target="_blank" rel="noopener noreferrer">
          ▲ vercel
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
    </div>
  );
}
