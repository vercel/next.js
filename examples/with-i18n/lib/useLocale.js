import React, {useState} from 'react';
import {useRouter} from "next/router";

const LocaleContext = React.createContext(null);
const localeKey = "locale";
const defaultLocale = "en"

export function useLocale() {
    const {dictionary, changeLocale} =  React.useContext(LocaleContext)

    return {
        dictionary,
        changeLocale
    }
}

export default function LocaleProvider({children, langDict}) {
    const [dictionary, setDictionary] = useState({});

    React.useEffect(() => {
        if (!localStorage.getItem(localeKey)) {
            localStorage.setItem(localeKey, defaultLocale)
        }
        setDictionary(langDict[localStorage.getItem(localeKey)])
    }, [langDict])

    const changeLocale = (lang) => {
        localStorage.setItem(localeKey, lang);
        setDictionary(langDict[lang]);
    }

    return <LocaleContext.Provider value={{dictionary, changeLocale}}>
        {children}
    </LocaleContext.Provider>
}

