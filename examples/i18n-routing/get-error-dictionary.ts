const errorDictionaries = {
  en: { title: "Something went wrong!", "try-again": "Try again" },
  de: { title: "Etwas ist schief gelaufen!", "try-again": "Erneut versuchen" },
  cs: { title: "Něco se pokazilo!", "try-again": "Zkusit znovu" },
};

export type ErrorDictionary = (typeof errorDictionaries)["en"];

export function getErrorDictionary(locale: string): ErrorDictionary {
  return (
    errorDictionaries[locale as keyof typeof errorDictionaries] ??
    errorDictionaries.en
  );
}
