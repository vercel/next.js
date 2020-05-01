export default async function fetchLocale(dataKey) {
    const availLang = ["en", "de"] //can also fetch from cms
    const fetchedLangDict = await Promise.all(availLang.map((lang) => import(`../public/locale/${lang}`)));
    const langDict = {};
    fetchedLangDict.forEach(({default: root}, index) => {
        langDict[availLang[index]] = root[dataKey];
    })
    return langDict
}