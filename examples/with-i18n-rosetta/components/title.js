import useI18n from "../hooks/use-i18n";

export default function Title({ username }) {
  const i18n = useI18n();
  return <h1>{i18n.t("intro.welcome", { username })}</h1>;
}
