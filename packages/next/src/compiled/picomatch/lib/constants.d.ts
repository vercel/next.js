declare const POSIX_CHARS: {
    DOT_LITERAL: string;
    PLUS_LITERAL: string;
    QMARK_LITERAL: string;
    SLASH_LITERAL: string;
    ONE_CHAR: string;
    QMARK: string;
    END_ANCHOR: string;
    DOTS_SLASH: string;
    NO_DOT: string;
    NO_DOTS: string;
    NO_DOT_SLASH: string;
    NO_DOTS_SLASH: string;
    QMARK_NO_DOT: string;
    STAR: string;
    START_ANCHOR: string;
};

/**
 * Windows glob regex
 */
declare const WINDOWS_CHARS: {
    SLASH_LITERAL: string;
    QMARK: string;
    STAR: string;
    DOTS_SLASH: string;
    NO_DOT: string;
    NO_DOTS: string;
    NO_DOT_SLASH: string;
    NO_DOTS_SLASH: string;
    QMARK_NO_DOT: string;
    START_ANCHOR: string;
    END_ANCHOR: string;
} & typeof POSIX_CHARS;

/**
 * POSIX Bracket Regex
 */
declare const POSIX_REGEX_SOURCE: {
    alnum: "a-zA-Z0-9";
    alpha: "a-zA-Z";
    ascii: "\\x00-\\x7F";
    blank: " \\t";
    cntrl: "\\x00-\\x1F\\x7F";
    digit: "0-9";
    graph: "\\x21-\\x7E";
    lower: "a-z";
    print: "\\x20-\\x7E ";
    punct: "\\-!\"#$%&'()\\*+,./:;<=>?@[\\]^_`{|}~";
    space: " \\t\\r\\n\\v\\f";
    upper: "A-Z";
    word: "A-Za-z0-9_";
    xdigit: "A-Fa-f0-9";
};

declare const constants: {
    MAX_LENGTH: number;
    POSIX_REGEX_SOURCE: typeof POSIX_REGEX_SOURCE;

    // regular expressions
    REGEX_BACKSLASH: RegExp;
    REGEX_NON_SPECIAL_CHARS: RegExp;
    REGEX_SPECIAL_CHARS: RegExp;
    REGEX_SPECIAL_CHARS_BACKREF: RegExp;
    REGEX_SPECIAL_CHARS_GLOBAL: RegExp;
    REGEX_REMOVE_BACKSLASH: RegExp;

    REPLACEMENTS: {
        "***": "*";
        "**/**": "**";
        "**/**/**": "**";
    };

    // Digits
    CHAR_0: number;
    CHAR_9: number;

    // Alphabet chars.
    CHAR_UPPERCASE_A: number;
    CHAR_LOWERCASE_A: number;
    CHAR_UPPERCASE_Z: number;
    CHAR_LOWERCASE_Z: number;

    CHAR_LEFT_PARENTHESES: number;
    CHAR_RIGHT_PARENTHESES: number;

    CHAR_ASTERISK: number;

    // Non-alphabetic chars.
    CHAR_AMPERSAND: number;
    CHAR_AT: number;
    CHAR_BACKWARD_SLASH: number;
    CHAR_CARRIAGE_RETURN: number;
    CHAR_CIRCUMFLEX_ACCENT: number;
    CHAR_COLON: number;
    CHAR_COMMA: number;
    CHAR_DOT: number;
    CHAR_DOUBLE_QUOTE: number;
    CHAR_EQUAL: number;
    CHAR_EXCLAMATION_MARK: number;
    CHAR_FORM_FEED: number;
    CHAR_FORWARD_SLASH: number;
    CHAR_GRAVE_ACCENT: number;
    CHAR_HASH: number;
    CHAR_HYPHEN_MINUS: number;
    CHAR_LEFT_ANGLE_BRACKET: number;
    CHAR_LEFT_CURLY_BRACE: number;
    CHAR_LEFT_SQUARE_BRACKET: number;
    CHAR_LINE_FEED: number;
    CHAR_NO_BREAK_SPACE: number;
    CHAR_PERCENT: number;
    CHAR_PLUS: number;
    CHAR_QUESTION_MARK: number;
    CHAR_RIGHT_ANGLE_BRACKET: number;
    CHAR_RIGHT_CURLY_BRACE: number;
    CHAR_RIGHT_SQUARE_BRACKET: number;
    CHAR_SEMICOLON: number;
    CHAR_SINGLE_QUOTE: number;
    CHAR_SPACE: number;
    CHAR_TAB: number;
    CHAR_UNDERSCORE: number;
    CHAR_VERTICAL_LINE: number;
    CHAR_ZERO_WIDTH_NOBREAK_SPACE: number;

    SEP: string;

    extGlobChars(chars: { STAR: string }): Record<string, { type: string; open: string; close: string }>;

    globChars<T extends boolean>(win32: T): T extends true ? typeof WINDOWS_CHARS : typeof POSIX_CHARS;
};

export = constants;
