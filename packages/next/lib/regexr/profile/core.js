/*
RegExr: Learn, Build, & Test RegEx
Copyright (C) 2017  gskinner.com, inc.

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
The core profile essentially defines every feature we support, and is then pared down by other profiles. All values should be y (true).

It also acts in part as pseudo documentation for all of the "type" values.
 */
let y = true,
  n = false

let core = {
  id: 'core',

  flags: {
    g: 'global', // note that this is not a real flag in some flavors, but a different method call
    i: 'caseinsensitive',
    m: 'multiline',
    s: 'dotall',
    u: 'unicode',
    y: 'sticky',
    x: 'extended',
    U: 'ungreedy',
  },

  // reserved characters that need to be escaped:
  escChars: '+*?^$\\.[]{}()|/'.split('').reduce((o, c) => {
    o[c] = y
    return o
  }, {}),

  // escape chars that are specifically not supported by the flavor:
  badEscChars: n,

  escCharCodes: {
    '0': 0, // null
    a: 7, // bell
    t: 9, // tab
    n: 10, // lf
    v: 11, // vertical tab
    f: 12, // form feed
    r: 13, // cr
    e: 27, // escape
  },

  escCharTypes: {
    A: 'bos',
    b: 'wordboundary',
    B: 'notwordboundary',
    d: 'digit',
    D: 'notdigit',
    G: 'prevmatchend',
    h: 'hwhitespace',
    H: 'nothwhitespace',
    K: 'keepout',
    N: 'notlinebreak',
    R: 'linebreak',
    s: 'whitespace',
    S: 'notwhitespace',
    v: 'vwhitespace',
    V: 'notvwhitespace',
    w: 'word',
    W: 'notword',
    X: 'unicodegrapheme',
    Z: 'eos',
    z: 'abseos',
  },

  charTypes: {
    '.': 'dot',
    '|': 'alt',
    $: 'eof',
    '^': 'bof',
    '?': 'opt', // also: "lazy"
    '+': 'plus', // also: "possessive"
    '*': 'star',
  },

  unquantifiable: {
    // all group/set open tokens are unquantifiable by default (ie. tokens with a .close value)
    quant: y,
    plus: y,
    star: y,
    opt: y,
    lazy: y,
    possessive: y,
    eof: y,
    bof: y,
    eos: y,
    abseos: y,
    alt: y,
    open: y,
    mode: y,
    comment: y, // TODO: this should actually be ignored by quantifiers.
    condition: y,
  },

  unicodeScripts: {
    // from: http://www.pcre.org/original/doc/html/pcrepattern.html
    Arabic: y,
    Armenian: y,
    Avestan: y,
    Balinese: y,
    Bamum: y,
    Bassa_Vah: y,
    Batak: y,
    Bengali: y,
    Bopomofo: y,
    Brahmi: y,
    Braille: y,
    Buginese: y,
    Buhid: y,
    Canadian_Aboriginal: y,
    Carian: y,
    Caucasian_Albanian: y,
    Chakma: y,
    Cham: y,
    Cherokee: y,
    Common: y,
    Coptic: y,
    Cuneiform: y,
    Cypriot: y,
    Cyrillic: y,
    Deseret: y,
    Devanagari: y,
    Duployan: y,
    Egyptian_Hieroglyphs: y,
    Elbasan: y,
    Ethiopic: y,
    Georgian: y,
    Glagolitic: y,
    Gothic: y,
    Grantha: y,
    Greek: y,
    Gujarati: y,
    Gurmukhi: y,
    Han: y,
    Hangul: y,
    Hanunoo: y,
    Hebrew: y,
    Hiragana: y,
    Imperial_Aramaic: y,
    Inherited: y,
    Inscriptional_Pahlavi: y,
    Inscriptional_Parthian: y,
    Javanese: y,
    Kaithi: y,
    Kannada: y,
    Katakana: y,
    Kayah_Li: y,
    Kharoshthi: y,
    Khmer: y,
    Khojki: y,
    Khudawadi: y,
    Lao: y,
    Latin: y,
    Lepcha: y,
    Limbu: y,
    Linear_A: y,
    Linear_B: y,
    Lisu: y,
    Lycian: y,
    Lydian: y,
    Mahajani: y,
    Malayalam: y,
    Mandaic: y,
    Manichaean: y,
    Meetei_Mayek: y,
    Mende_Kikakui: y,
    Meroitic_Cursive: y,
    Meroitic_Hieroglyphs: y,
    Miao: y,
    Modi: y,
    Mongolian: y,
    Mro: y,
    Myanmar: y,
    Nabataean: y,
    New_Tai_Lue: y,
    Nko: y,
    Ogham: y,
    Ol_Chiki: y,
    Old_Italic: y,
    Old_North_Arabian: y,
    Old_Permic: y,
    Old_Persian: y,
    Old_South_Arabian: y,
    Old_Turkic: y,
    Oriya: y,
    Osmanya: y,
    Pahawh_Hmong: y,
    Palmyrene: y,
    Pau_Cin_Hau: y,
    Phags_Pa: y,
    Phoenician: y,
    Psalter_Pahlavi: y,
    Rejang: y,
    Runic: y,
    Samaritan: y,
    Saurashtra: y,
    Sharada: y,
    Shavian: y,
    Siddham: y,
    Sinhala: y,
    Sora_Sompeng: y,
    Sundanese: y,
    Syloti_Nagri: y,
    Syriac: y,
    Tagalog: y,
    Tagbanwa: y,
    Tai_Le: y,
    Tai_Tham: y,
    Tai_Viet: y,
    Takri: y,
    Tamil: y,
    Telugu: y,
    Thaana: y,
    Thai: y,
    Tibetan: y,
    Tifinagh: y,
    Tirhuta: y,
    Ugaritic: y,
    Vai: y,
    Warang_Citi: y,
    Yi: y,
  },

  unicodeCategories: {
    // from: http://www.pcre.org/original/doc/html/pcrepattern.html
    C: y, // Other
    Cc: y, // Control
    Cf: y, // Format
    Cn: y, // Unassigned
    Co: y, // Private use
    Cs: y, // Surrogate
    L: y, // Letter
    'L&': y, // Any letter
    Ll: y, // Lower case letter
    Lm: y, // Modifier letter
    Lo: y, // Other letter
    Lt: y, // Title case letter
    Lu: y, // Upper case letter
    M: y, // Mark
    Mc: y, // Spacing mark
    Me: y, // Enclosing mark
    Mn: y, // Non-spacing mark
    N: y, // Number
    Nd: y, // Decimal number
    Nl: y, // Letter number
    No: y, // Other number
    P: y, // Punctuation
    Pc: y, // Connector punctuation
    Pd: y, // Dash punctuation
    Pe: y, // Close punctuation
    Pf: y, // Final punctuation
    Pi: y, // Initial punctuation
    Po: y, // Other punctuation
    Ps: y, // Open punctuation
    S: y, // Symbol
    Sc: y, // Currency symbol
    Sk: y, // Modifier symbol
    Sm: y, // Mathematical symbol
    So: y, // Other symbol
    Z: y, // Separator
    Zl: y, // Line separator
    Zp: y, // Paragraph separator
    Zs: y, // Space separator
  },

  posixCharClasses: {
    // from: http://www.pcre.org/original/doc/html/pcrepattern.html
    alnum: y, // letters and digits
    alpha: y, // letters
    ascii: y, // character codes 0 - 127
    blank: y, // space or tab only
    cntrl: y, // control characters
    digit: y, // decimal digits (same as \d)
    graph: y, // printing characters, excluding space
    lower: y, // lower case letters
    print: y, // printing characters, including space
    punct: y, // printing characters, excluding letters and digits and space
    space: y, // white space (the same as \s from PCRE 8.34)
    upper: y, // upper case letters
    word: y, // "word" characters (same as \w)
    xdigit: y, // hexadecimal digits
  },

  modes: {
    i: 'caseinsensitive',
    s: 'dotall',
    m: 'multiline',
    x: 'freespacing',
    J: 'samename',
    U: 'switchlazy',
  },

  tokens: {
    // note that not all of these are actively used in the lexer, but are included for completeness.
    open: y, // opening /
    close: y, // closing /
    char: y, // abc

    // classes:
    // also in escCharTypes and charTypes
    set: y, // [a-z]
    setnot: y, // [^a-z]
    setclose: y, // ]
    range: y, // [a-z]
    unicodecat: y, // \p{Ll} \P{^Ll} \pL
    notunicodecat: y, // \P{Ll} \p{^Ll} \PL
    unicodescript: y, // \p{Cherokee} \P{^Cherokee}
    notunicodescript: y, // \P{Cherokee} \p{^Cherokee}
    posixcharclass: y, // [[:alpha:]]
    // not in supported flavors:	"posixcollseq": y, // [[.foo.]] // this is recognized by the lexer, currently returns "notsupported" error
    // not in supported flavors:	"unicodeblock": y, // \p{InThai} \p{IsThai} and NOT \P
    // not in supported flavors:	"subtract": y, // [base-[subtract]]
    // not in supported flavors:	"intersect": y, // [base&&[intersect]]

    // esc:
    // also in escCharCodes and escCharTypes
    escoctal: y, // \11
    escunicodeu: y, // \uFFFF
    escunicodeub: y, // \u{00A9}
    escunicodexb: y, // \x{00A9}
    escsequence: y, // \Q...\E
    eschexadecimal: y, // \xFF
    esccontrolchar: y, // \cA
    escoctalo: y, // \o{377} // resolved to escoctal in lexer, no docs required
    escchar: y, // \m (unrecognized escapes) // no reference documentation required

    // group:
    group: y, // (foo)
    groupclose: y, // )
    noncapgroup: y, // (?:foo)
    namedgroup: y, // (?P<name>foo) (?<name>foo) (?'name'foo)
    atomic: y, // (?>foo|bar)
    define: y, // (?(DEFINE)foo)
    branchreset: y, // (?|(a)|(b))

    // lookaround:
    poslookbehind: y, // (?<=foo)
    neglookbehind: y, // (?<!foo)
    poslookahead: y, // (?=foo)
    neglookahead: y, // (?!foo)

    // ref:
    namedref: y, // \k<name> \k'name' \k{name} (?P=name)  \g{name}
    numref: y, // \1
    extnumref: y, // \g{-1} \g{+1} \g{1} \g1 \g-1
    recursion: y, // (?R) (?0) \g<0> \g'0'
    numsubroutine: y, // \g<1> \g'-1' (?1) (?-1)
    namedsubroutine: y, // \g<name> \g'name' (?&name) (?P>name)

    // quantifiers:
    // also in specialChars
    quant: y, // {1,2}
    possessive: y, // ++
    lazy: y, // ?

    // special:
    conditional: y, // (?(?=if)then|else)
    condition: y, // (?=if) any lookaround
    conditionalelse: y, // |
    conditionalgroup: y, // (?(1)a|b) (?(-1)a|b) (?(name)a|b)
    mode: y, // (?i-x) see modes above
    comment: y, // (?#comment)

    // meta:
    matchanyset: y, // [\s\S]
  },

  substTokens: {
    // named references aren't supported in JS or PCRE / PHP
    subst_$esc: y, // $$
    'subst_$&match': y, // $&
    subst_$before: y, // $`
    subst_$after: y, // $'
    subst_$group: y, // $1 $99 // resolved to subst_group in lexer, no docs required
    subst_$bgroup: y, // ${1} ${99} // resolved to subst_group in lexer, no docs required
    subst_bsgroup: y, // \1 \99 // resolved to subst_group in lexer, no docs required
    subst_group: y, // $1 \1 \{1} // combined in docs, not used by lexer
    subst_0match: y, // $0 \0 \{0}

    // this isn't a feature of the engine, but of RegExr:
    subst_esc: y, // \n \r \u1234
  },

  config: {
    forwardref: y, // \1(a)
    nestedref: y, // (\1a|b)+
    ctrlcodeerr: y, // does \c error? (vs decompose)
    reftooctalalways: y, // does a single digit reference \1 become an octal? (vs remain an unmatched ref)
    substdecomposeref: y, // will a subst reference decompose? (ex. \3 becomes "\" & "3" if < 3 groups)
    looseesc: y, // should unrecognized escape sequences match the character (ex. \u could match "u") // disabled when `u` flag is set
    unicodenegated: y, // \p{^etc}"
    namedgroupalt: y, // if false, only support (?<name>foo)
  },

  docs: {
    // for example:
    //possessive: {desc: "+This will be appended to the existing entry." },
    //namedgroup: {tip: "This will overwrite the existing entry." }
  },
}

module.exports = core
