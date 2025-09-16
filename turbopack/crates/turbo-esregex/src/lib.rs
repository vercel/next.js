#![feature(arbitrary_self_types_pointers)]

use std::vec;

use anyhow::{Result, bail};

/// A simple regular expression implementation following ecmascript semantics
///
/// Delegates to the `regex` crate when possible and `regress` otherwise.
#[derive(Debug, Clone)]
#[turbo_tasks::value(eq = "manual", shared)]
#[serde(into = "RegexForm", try_from = "RegexForm")]
pub struct EsRegex {
    #[turbo_tasks(trace_ignore)]
    delegate: EsRegexImpl,
    // Store the original arguments used to construct
    // this regex to support equality and serialization.
    pub pattern: String,
    pub flags: String,
}

#[derive(Debug, Clone)]
enum EsRegexImpl {
    Regex(regex::Regex),
    Regress(regress::Regex),
}

/// Equality uses the source inputs since our delegate regex impls don't support
/// equality natively.
/// NOTE: there are multiple 'equivalent' ways to write a regex and this
/// approach does _not_ attempt to equate them.
impl PartialEq for EsRegex {
    fn eq(&self, other: &Self) -> bool {
        self.pattern == other.pattern && self.flags == other.flags
    }
}
impl Eq for EsRegex {}

impl TryFrom<RegexForm> for EsRegex {
    type Error = anyhow::Error;

    fn try_from(value: RegexForm) -> std::result::Result<Self, Self::Error> {
        EsRegex::new(&value.pattern, &value.flags)
    }
}

/// This is the serializable form for the `EsRegex` struct
#[derive(serde::Serialize, serde::Deserialize, Debug, Clone)]
struct RegexForm {
    pattern: String,
    flags: String,
}

impl From<EsRegex> for RegexForm {
    fn from(value: EsRegex) -> Self {
        Self {
            pattern: value.pattern,
            flags: value.flags,
        }
    }
}

impl EsRegex {
    /// Support ecmascript style regular expressions by selecting the `regex` crate when possible
    /// and using regress when not.
    pub fn new(pattern: &str, flags: &str) -> Result<Self> {
        // rust regex doesn't allow escaped slashes, but they are necessary in js
        let pattern = pattern.replace("\\/", "/");

        let mut applied_flags = String::new();
        for flag in flags.chars() {
            match flag {
                // indices for substring matches: not relevant for the regex itself
                'd' => {}
                // global: default in rust, ignore
                'g' => {}
                // case-insensitive: letters match both upper and lower case
                'i' => applied_flags.push('i'),
                // multi-line mode: ^ and $ match begin/end of line
                'm' => applied_flags.push('m'),
                // allow . to match \n
                's' => applied_flags.push('s'),
                // Unicode support (enabled by default)
                'u' => applied_flags.push('u'),
                // sticky search: not relevant for the regex itself
                'y' => {}
                _ => bail!("unsupported flag `{flag}` in regex: `{pattern}` with flags: `{flags}`"),
            }
        }

        let regex = if !applied_flags.is_empty() {
            regex::Regex::new(&format!("(?{applied_flags}){pattern}"))
        } else {
            regex::Regex::new(&pattern)
        };

        let delegate = match regex {
            Ok(reg) => Ok(EsRegexImpl::Regex(reg)),
            Err(_e) => {
                // We failed to parse as an regex:Regex, try using regress. Regress uses the es
                // flags format so we can pass the original flags value.
                match regress::Regex::with_flags(&pattern, regress::Flags::from(flags)) {
                    Ok(reg) => Ok(EsRegexImpl::Regress(reg)),
                    // Propagate the error as is, regress has useful error messages.
                    Err(e) => Err(e),
                }
            }
        }?;
        Ok(Self {
            delegate,
            pattern,
            flags: flags.to_string(),
        })
    }

    /// Returns true if there is any match for this regex in the `haystack`.
    pub fn is_match(&self, haystack: &str) -> bool {
        match &self.delegate {
            EsRegexImpl::Regex(r) => r.is_match(haystack),
            EsRegexImpl::Regress(r) => r.find(haystack).is_some(),
        }
    }

    /// Searches for the first match of the regex in the `haystack`, and iterates over the capture
    /// groups within that first match.
    ///
    /// `None` is returned if there is no match. Individual capture groups may be `None` if the
    /// capture group wasn't included in the match.
    ///
    /// The first capture group is always present ([`Some`]) and represents the entire match.
    ///
    /// Capture groups are represented as string slices of the `haystack`, and live for the lifetime
    /// of `haystack`.
    pub fn captures<'h>(&self, haystack: &'h str) -> Option<Captures<'h>> {
        let delegate = match &self.delegate {
            EsRegexImpl::Regex(r) => CapturesImpl::Regex {
                captures: r.captures(haystack)?,
                idx: 0,
            },
            EsRegexImpl::Regress(r) => {
                let re_match = r.find(haystack)?;
                CapturesImpl::Regress {
                    captures_iter: re_match.captures.into_iter(),
                    haystack,
                    match_range: Some(re_match.range),
                }
            }
        };
        Some(Captures { delegate })
    }
}

pub struct Captures<'h> {
    delegate: CapturesImpl<'h>,
}

enum CapturesImpl<'h> {
    // We have to use `regex::Captures` (which is not an iterator) here instead of
    // `regex::SubCaptureMatches` (an iterator) because `SubCaptureMatches` must have a reference
    // to `Capture`, and that would require a self-referential struct.
    //
    // Ideally, `regex::Capture` would implement `IntoIterator`, and we could use that here
    // instead.
    Regex {
        captures: regex::Captures<'h>,
        idx: usize,
    },
    // We can't use the iterator from `regress::Match::groups()` due to similar lifetime issues.
    Regress {
        captures_iter: vec::IntoIter<Option<regress::Range>>,
        haystack: &'h str,
        match_range: Option<regress::Range>,
    },
}

impl<'h> Iterator for Captures<'h> {
    type Item = Option<&'h str>;

    fn next(&mut self) -> Option<Self::Item> {
        match &mut self.delegate {
            CapturesImpl::Regex { captures, idx } => {
                if *idx >= captures.len() {
                    None
                } else {
                    let capture = Some(captures.get(*idx).map(|sub_match| sub_match.as_str()));
                    *idx += 1;
                    capture
                }
            }
            CapturesImpl::Regress {
                captures_iter,
                haystack,
                match_range,
            } => {
                if let Some(range) = match_range.take() {
                    // always yield range first
                    Some(Some(&haystack[range]))
                } else {
                    Some(captures_iter.next()?.map(|range| &haystack[range]))
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{EsRegex, EsRegexImpl};

    #[test]
    fn round_trip_serialize() {
        let regex = EsRegex::new("[a-z]", "i").unwrap();
        let serialized = serde_json::to_string(&regex).unwrap();
        let parsed = serde_json::from_str::<EsRegex>(&serialized).unwrap();
        assert_eq!(regex, parsed);
    }

    #[test]
    fn es_regex_matches_simple() {
        let regex = EsRegex::new("a", "").unwrap();
        assert!(matches!(regex.delegate, EsRegexImpl::Regex { .. }));
        assert!(regex.is_match("a"));
    }

    #[test]
    fn es_regex_matches_negative_lookahead() {
        // This feature is not supported by the regex crate
        let regex = EsRegex::new("a(?!b)", "").unwrap();
        assert!(matches!(regex.delegate, EsRegexImpl::Regress { .. }));
        assert!(!regex.is_match("ab"));
        assert!(regex.is_match("ac"));
    }

    #[test]
    fn invalid_regex() {
        // This is invalid since there is nothing being repeated
        // Don't bother asserting on the message since we delegate
        // that to the underlying implementations.
        assert!(matches!(EsRegex::new("*", ""), Err { .. }))
    }

    #[test]
    fn captures_with_regex() {
        let regex = EsRegex::new(r"(notmatched)|(\d{4})-(\d{2})-(\d{2})", "").unwrap();
        assert!(matches!(regex.delegate, EsRegexImpl::Regex { .. }));

        let captures = regex.captures("Today is 2024-01-15");
        assert!(captures.is_some());
        let caps: Vec<_> = captures.unwrap().collect();
        assert_eq!(caps.len(), 5); // full match + 4 groups
        assert_eq!(caps[0], Some("2024-01-15")); // full match
        assert_eq!(caps[1], None); // 'notmatched' -- this branch isn't taken
        assert_eq!(caps[2], Some("2024")); // year
        assert_eq!(caps[3], Some("01")); // month
        assert_eq!(caps[4], Some("15")); // day
    }

    #[test]
    fn captures_with_regress() {
        let regex = EsRegex::new(r"(\w+)(?=baz)", "").unwrap();
        assert!(matches!(regex.delegate, EsRegexImpl::Regress { .. }));

        let captures = regex.captures("foobar");
        assert!(captures.is_none());

        let captures = regex.captures("foobaz");
        assert!(captures.is_some());
        let caps: Vec<_> = captures.unwrap().collect();
        assert_eq!(caps.len(), 2); // full match + 1 group
        assert_eq!(caps[0], Some("foo")); // full match
        assert_eq!(caps[1], Some("foo")); // captured group
    }
}
