// Reference: https://hreflang.org/what-is-a-valid-hreflang

// The TS language server is very slow when it's formatted into multiple lines.
// prettier-ignore
type LangCode = 'aa' | 'ab' | 'ae' | 'af' | 'ak' | 'am' | 'an' | 'ar' | 'as' | 'av' | 'ay' | 'az' | 'ba' | 'be' | 'bg' | 'bh' | 'bi' | 'bm' | 'bn' | 'bo' | 'br' | 'bs' | 'ca' | 'ce' | 'ch' | 'co' | 'cr' | 'cs' | 'cu' | 'cv' | 'cy' | 'da' | 'de' | 'dv' | 'dz' | 'ee' | 'el' | 'en' | 'eo' | 'es' | 'et' | 'eu' | 'fa' | 'ff' | 'fi' | 'fj' | 'fo' | 'fr' | 'fy' | 'ga' | 'gd' | 'gl' | 'gn' | 'gu' | 'gv' | 'ha' | 'he' | 'hi' | 'ho' | 'hr' | 'ht' | 'hu' | 'hy' | 'hz' | 'ia' | 'id' | 'ie' | 'ig' | 'ii' | 'ik' | 'io' | 'is' | 'it' | 'iu' | 'ja' | 'jv' | 'ka' | 'kg' | 'ki' | 'kj' | 'kk' | 'kl' | 'km' | 'kn' | 'ko' | 'kr' | 'ks' | 'ku' | 'kv' | 'kw' | 'ky' | 'la' | 'lb' | 'lg' | 'li' | 'ln' | 'lo' | 'lt' | 'lu' | 'lv' | 'mg' | 'mh' | 'mi' | 'mk' | 'ml' | 'mn' | 'mr' | 'ms' | 'mt' | 'my' | 'na' | 'nb' | 'nd' | 'ne' | 'ng' | 'nl' | 'nn' | 'no' | 'nr' | 'nv' | 'ny' | 'oc' | 'oj' | 'om' | 'or' | 'os' | 'pa' | 'pi' | 'pl' | 'ps' | 'pt' | 'qu' | 'rm' | 'rn' | 'ro' | 'ru' | 'rw' | 'sa' | 'sc' | 'sd' | 'se' | 'sg' | 'si' | 'sk' | 'sl' | 'sm' | 'sn' | 'so' | 'sq' | 'sr' | 'ss' | 'st' | 'su' | 'sv' | 'sw' | 'ta' | 'te' | 'tg' | 'th' | 'ti' | 'tk' | 'tl' | 'tn' | 'to' | 'tr' | 'ts' | 'tt' | 'tw' | 'ty' | 'ug' | 'uk' | 'ur' | 'uz' | 've' | 'vi' | 'vo' | 'wa' | 'wo' | 'xh' | 'yi' | 'yo' | 'za' | 'zh' | 'zu'

// prettier-ignore
type RegionCode = 'AD' | 'AE' | 'AF' | 'AG' | 'AI' | 'AL' | 'AM' | 'AO' | 'AQ' | 'AR' | 'AS' | 'AT' | 'AU' | 'AW' | 'AX' | 'AZ' | 'BA' | 'BB' | 'BD' | 'BE' | 'BF' | 'BG' | 'BH' | 'BI' | 'BJ' | 'BL' | 'BM' | 'BN' | 'BO' | 'BQ' | 'BR' | 'BS' | 'BT' | 'BV' | 'BW' | 'BY' | 'BZ' | 'CA' | 'CC' | 'CD' | 'CF' | 'CG' | 'CH' | 'CI' | 'CK' | 'CL' | 'CM' | 'CN' | 'CO' | 'CR' | 'CU' | 'CV' | 'CW' | 'CX' | 'CY' | 'CZ' | 'DE' | 'DJ' | 'DK' | 'DM' | 'DO' | 'DZ' | 'EC' | 'EE' | 'EG' | 'EH' | 'ER' | 'ES' | 'ET' | 'FI' | 'FJ' | 'FK' | 'FM' | 'FO' | 'FR' | 'GA' | 'GB' | 'GD' | 'GE' | 'GF' | 'GG' | 'GH' | 'GI' | 'GL' | 'GM' | 'GN' | 'GP' | 'GQ' | 'GR' | 'GS' | 'GT' | 'GU' | 'GW' | 'GY' | 'HK' | 'HM' | 'HN' | 'HR' | 'HT' | 'HU' | 'ID' | 'IE' | 'IL' | 'IM' | 'IN' | 'IO' | 'IQ' | 'IR' | 'IS' | 'IT' | 'JE' | 'JM' | 'JO' | 'JP' | 'KE' | 'KG' | 'KH' | 'KI' | 'KM' | 'KN' | 'KP' | 'KR' | 'KW' | 'KY' | 'KZ' | 'LA' | 'LB' | 'LC' | 'LI' | 'LK' | 'LR' | 'LS' | 'LT' | 'LU' | 'LV' | 'LY' | 'MA' | 'MC' | 'MD' | 'ME' | 'MF' | 'MG' | 'MH' | 'MK' | 'ML' | 'MM' | 'MN' | 'MO' | 'MP' | 'MQ' | 'MR' | 'MS' | 'MT' | 'MU' | 'MV' | 'MW' | 'MX' | 'MY' | 'MZ' | 'NA' | 'NC' | 'NE' | 'NF' | 'NG' | 'NI' | 'NL' | 'NO' | 'NP' | 'NR' | 'NU' | 'NZ' | 'OM' | 'PA' | 'PE' | 'PF' | 'PG' | 'PH' | 'PK' | 'PL' | 'PM' | 'PN' | 'PR' | 'PS' | 'PT' | 'PW' | 'PY' | 'QA' | 'RE' | 'RO' | 'RS' | 'RU' | 'RW' | 'SA' | 'SB' | 'SC' | 'SD' | 'SE' | 'SG' | 'SH' | 'SI' | 'SJ' | 'SK' | 'SL' | 'SM' | 'SN' | 'SO' | 'SR' | 'SS' | 'ST' | 'SV' | 'SX' | 'SY' | 'SZ' | 'TC' | 'TD' | 'TF' | 'TG' | 'TH' | 'TJ' | 'TK' | 'TL' | 'TM' | 'TN' | 'TO' | 'TR' | 'TT' | 'TV' | 'TW' | 'TZ' | 'UA' | 'UG' | 'UM' | 'US' | 'UY' | 'UZ' | 'VA' | 'VC' | 'VE' | 'VG' | 'VI' | 'VN' | 'VU' | 'WF' | 'WS' | 'YE' | 'YT' | 'ZA' | 'ZM' | 'ZW'

// prettier-ignore
type ScriptCode = 'Adlm' | 'Afak' | 'Aghb' | 'Ahom' | 'Arab' | 'Aran' | 'Armi' | 'Armn' | 'Avst' | 'Bali' | 'Bamu' | 'Bass' | 'Batk' | 'Beng' | 'Bhks' | 'Blis' | 'Bopo' | 'Brah' | 'Brai' | 'Bugi' | 'Buhd' | 'Cakm' | 'Cans' | 'Cari' | 'Cham' | 'Cher' | 'Cirt' | 'Copt' | 'Cprt' | 'Cyrl' | 'Cyrs' | 'Deva' | 'Dsrt' | 'Dupl' | 'Egyd' | 'Egyh' | 'Egyp' | 'Elba' | 'Ethi' | 'Geok' | 'Geor' | 'Glag' | 'Goth' | 'Gran' | 'Grek' | 'Gujr' | 'Guru' | 'Hang' | 'Hani' | 'Hano' | 'Hans' | 'Hant' | 'Hatr' | 'Hebr' | 'Hira' | 'Hluw' | 'Hmng' | 'Hrkt' | 'Hung' | 'Inds' | 'Ital' | 'Java' | 'Jpan' | 'Jurc' | 'Kali' | 'Kana' | 'Khar' | 'Khmr' | 'Khoj' | 'Kitl' | 'Kits' | 'Knda' | 'Kore' | 'Kpel' | 'Kthi' | 'Lana' | 'Laoo' | 'Latf' | 'Latg' | 'Latn' | 'Leke' | 'Lepc' | 'Limb' | 'Lina' | 'Linb' | 'Lisu' | 'Loma' | 'Lyci' | 'Lydi' | 'Mahj' | 'Mand' | 'Mani' | 'Marc' | 'Maya' | 'Mend' | 'Merc' | 'Mero' | 'Mlym' | 'Modi' | 'Mong' | 'Moon' | 'Mroo' | 'Mtei' | 'Mult' | 'Mymr' | 'Narb' | 'Nbat' | 'Nkgb' | 'Nkoo' | 'Nshu' | 'Ogam' | 'Olck' | 'Orkh' | 'Orya' | 'Osge' | 'Osma' | 'Palm' | 'Pauc' | 'Perm' | 'Phag' | 'Phli' | 'Phlp' | 'Phlv' | 'Phnx' | 'Plrd' | 'Prti' | 'Rjng' | 'Roro' | 'Runr' | 'Samr' | 'Sara' | 'Sarb' | 'Saur' | 'Sgnw' | 'Shaw' | 'Shrd' | 'Sidd' | 'Sind' | 'Sinh' | 'Sora' | 'Sund' | 'Sylo' | 'Syrc' | 'Syre' | 'Syrj' | 'Syrn' | 'Tagb' | 'Takr' | 'Tale' | 'Talu' | 'Taml' | 'Tang' | 'Tavt' | 'Telu' | 'Teng' | 'Tfng' | 'Tglg' | 'Thaa' | 'Thai' | 'Tibt' | 'Tirh' | 'Ugar' | 'Vaii' | 'Visp' | 'Wara' | 'Wole' | 'Xpeo' | 'Xsux' | 'Yiii'

type UnmatchedLang = 'x-default'

type HrefLang = LangCode | UnmatchedLang

type HrefLangWithRegion = `${LangCode}-${RegionCode}`
type HrefLangWithScript = `${LangCode}-${ScriptCode}`

// It's allowed to have both region and script as fallback. However that union is
// so large that TypeScript can't handle it:
// https://github.com/microsoft/TypeScript/issues/43335
// So here we use a workaround by using `string` and merging the object types to
// avoid making a large union type.
// Note that it will match some invalid values unfortunately.
type HrefLangWithScriptAndRegionRecord<T> = {
  [s in `${HrefLangWithScript}-${string}`]?: T
} & {
  [s in `${Lowercase<HrefLangWithScript>}-${string}`]?: T
}

type HrefLangWithRegionAndScriptRecord<T> = {
  [s in `${HrefLangWithRegion}-${string}`]?: T
} & {
  [s in `${Lowercase<HrefLangWithRegion>}-${string}`]?: T
}

type Languages<T> = {
  [s in HrefLang]?: T
} & {
  [s in HrefLangWithRegion]?: T
} & {
  [s in HrefLangWithScript]?: T
} & {
  // It's allowed to use lowercased region/script code too.
  [s in Lowercase<HrefLangWithRegion>]?: T
} & {
  [s in Lowercase<HrefLangWithScript>]?: T
} & HrefLangWithScriptAndRegionRecord<T> &
  HrefLangWithRegionAndScriptRecord<T>

export type AlternateURLs = {
  canonical?: null | string | URL
  languages?: Languages<null | string | URL>
  media?: {
    [media: string]: null | string | URL
  }
  types?: {
    [types: string]: null | string | URL
  }
}

export type ResolvedAlternateURLs = {
  canonical: null | URL
  languages: Languages<null | URL>
  media?: {
    [media: string]: null | URL
  }
  types?: {
    [types: string]: null | URL
  }
}
