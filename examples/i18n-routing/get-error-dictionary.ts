/**
 * Synchronous error dictionary for Client Components.
 *
 * The full dictionaries are loaded in server components only to avoid shipping
 * all translations to the client. These error strings are duplicated here but
 * kept minimal so they can be included in the error client bundle for fast
 * feedback. This trade-off of duplication for reliability ensures proper
 * localised UI even when errors occur.
 */
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
