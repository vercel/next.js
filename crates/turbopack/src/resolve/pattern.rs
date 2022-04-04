use std::{fmt::Display, mem::take};

use anyhow::Result;
use lazy_static::lazy_static;
use regex::Regex;
use turbo_tasks::{Value, Vc};
use turbo_tasks_fs::{DirectoryContent, DirectoryEntry, FileSystemPathVc};

#[turbo_tasks::value(shared)]
#[derive(PartialEq, Eq, Hash, Clone, Debug)]
pub enum Pattern {
    Constant(String),
    Dynamic,
    Alternatives(Vec<Pattern>),
    Concatenation(Vec<Pattern>),
}

impl Default for Pattern {
    fn default() -> Self {
        Pattern::Dynamic
    }
}

impl Pattern {
    // TODO this should be removed in favor of pattern resolving
    pub fn into_string(self) -> Option<String> {
        match self {
            Pattern::Constant(str) => Some(str),
            _ => None,
        }
    }

    pub fn has_constant_parts(&self) -> bool {
        match self {
            Pattern::Constant(_) => true,
            Pattern::Dynamic => false,
            Pattern::Alternatives(list) | Pattern::Concatenation(list) => {
                list.iter().any(|p| p.has_constant_parts())
            }
        }
    }

    pub fn extend(&mut self, concatenated: impl Iterator<Item = Self>) {
        if let Pattern::Concatenation(list) = self {
            list.extend(concatenated);
        } else {
            let mut vec = vec![take(self)];
            for item in concatenated {
                if let Pattern::Concatenation(more) = item {
                    vec.extend(more);
                } else {
                    vec.push(item);
                }
            }
            *self = Pattern::Concatenation(vec);
        }
    }

    pub fn push(&mut self, pat: Pattern) {
        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(more)) => {
                list.extend(more);
            }
            (Pattern::Concatenation(list), pat) => list.push(pat),
            (this, Pattern::Concatenation(mut list)) => {
                list.insert(0, take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(other)) => str.push_str(&other),
            (this, pat) => {
                *this = Pattern::Concatenation(vec![take(this), pat]);
            }
        }
    }

    pub fn push_front(&mut self, pat: Pattern) {
        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(more)) => {
                *list = [more, take(list)].concat()
            }
            (Pattern::Concatenation(list), pat) => list.insert(0, pat),
            (this, Pattern::Concatenation(mut list)) => {
                list.push(take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(mut other)) => {
                other.push_str(&str);
                *str = other;
            }
            (this, pat) => {
                *this = Pattern::Concatenation(vec![pat, take(this)]);
            }
        }
    }

    pub fn alternatives(alts: impl IntoIterator<Item = Pattern>) -> Self {
        let mut list = Vec::new();
        for alt in alts {
            if let Pattern::Alternatives(inner) = alt {
                list.extend(inner);
            } else {
                list.push(alt)
            }
        }
        Self::Alternatives(list)
    }

    /// Order into Alternatives -> Concatenation -> Constant/Dynamic
    /// Merge when possible
    pub fn normalize(&mut self) {
        let mut alternatives = vec![Vec::new()];
        match self {
            Pattern::Constant(c) => {
                for alt in alternatives.iter_mut() {
                    alt.push(Pattern::Constant(c.clone()));
                }
            }
            Pattern::Dynamic => {
                for alt in alternatives.iter_mut() {
                    alt.push(Pattern::Dynamic);
                }
            }
            Pattern::Alternatives(list) => {
                for alt in list.iter_mut() {
                    alt.normalize();
                }
                let mut new_alternatives = Vec::new();
                for alt in list.drain(..) {
                    if let Pattern::Alternatives(inner) = alt {
                        for alt in inner {
                            new_alternatives.push(alt);
                        }
                    } else {
                        new_alternatives.push(alt);
                    }
                }
                *list = new_alternatives;
            }
            Pattern::Concatenation(list) => {
                let mut has_alternatives = false;
                for part in list.iter_mut() {
                    part.normalize();
                    if let Pattern::Alternatives(_) = part {
                        has_alternatives = true;
                    }
                }
                if has_alternatives {
                    // list has items that are one of these
                    // * Alternatives -> [Concatenation] -> ...
                    // * [Concatenation] -> ...
                    let mut new_alternatives: Vec<Vec<Pattern>> = vec![Vec::new()];
                    for part in list.drain(..) {
                        if let Pattern::Alternatives(list) = part {
                            // list is [Concatenation] -> ...
                            let mut combined = Vec::new();
                            for alt2 in list.iter() {
                                for mut alt in new_alternatives.clone() {
                                    if let Pattern::Concatenation(parts) = alt2 {
                                        alt.extend(parts.clone());
                                    } else {
                                        alt.push(alt2.clone());
                                    }
                                    combined.push(alt)
                                }
                            }
                        } else {
                            // part is [Concatenation] -> ...
                            for alt in new_alternatives.iter_mut() {
                                if let Pattern::Concatenation(ref parts) = part {
                                    alt.extend(parts.clone());
                                } else {
                                    alt.push(part.clone());
                                }
                            }
                        }
                    }
                    // new_alternatives has items in that form:
                    // * [Concatenation] -> ...
                    *self = Pattern::Alternatives(
                        new_alternatives
                            .into_iter()
                            .map(|parts| {
                                if parts.len() == 1 {
                                    parts.into_iter().next().unwrap()
                                } else {
                                    Pattern::Concatenation(parts)
                                }
                            })
                            .collect(),
                    );
                } else {
                    let mut new_parts = Vec::new();
                    for part in list.drain(..) {
                        fn add_part(part: Pattern, new_parts: &mut Vec<Pattern>) {
                            match part {
                                Pattern::Constant(c) => {
                                    if !c.is_empty() {
                                        if let Some(Pattern::Constant(last)) = new_parts.last_mut()
                                        {
                                            last.push_str(&c);
                                        } else {
                                            new_parts.push(Pattern::Constant(c));
                                        }
                                    }
                                }
                                Pattern::Dynamic => {
                                    if let Some(Pattern::Dynamic) = new_parts.last() {
                                        // do nothing
                                    } else {
                                        new_parts.push(Pattern::Dynamic);
                                    }
                                }
                                Pattern::Concatenation(parts) => {
                                    for part in parts {
                                        add_part(part, new_parts);
                                    }
                                }
                                Pattern::Alternatives(_) => unreachable!(),
                            }
                        }

                        add_part(part, &mut new_parts);
                    }
                    *list = new_parts;
                }
            }
        }
    }

    pub fn is_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None).is_match())
        } else {
            self.match_internal(value, None).is_match()
        }
    }

    pub fn could_match_others(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None).could_match_others())
        } else {
            self.match_internal(value, None).could_match_others()
        }
    }

    pub fn could_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter()
                .any(|alt| alt.match_internal(value, None).could_match())
        } else {
            self.match_internal(value, None).could_match()
        }
    }

    fn match_internal<'a>(
        &self,
        mut value: &'a str,
        mut any_offset: Option<usize>,
    ) -> MatchResult<'a> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(c) {
                        if index <= offset {
                            MatchResult::Consumed(&value[index + c.len()..], None)
                        } else {
                            MatchResult::None
                        }
                    } else if offset >= value.len() {
                        MatchResult::Partial(None)
                    } else {
                        MatchResult::None
                    }
                } else {
                    if value.starts_with(c) {
                        MatchResult::Consumed(&value[c.len()..], None)
                    } else if c.starts_with(value) {
                        MatchResult::Partial(None)
                    } else {
                        MatchResult::None
                    }
                }
            }
            Pattern::Dynamic => {
                lazy_static! {
                    static ref FORBIDDEN: Regex =
                        Regex::new(r"(/|^)(\.|(node_modules|__tests?__)(/|$))").unwrap();
                    static ref FORBIDDEN_MATCH: Regex = Regex::new(r"\.d\.ts$|\.map$").unwrap();
                };
                if let Some(m) = FORBIDDEN.find(value) {
                    MatchResult::Consumed(value, Some(m.start()))
                } else if let Some(_) = FORBIDDEN_MATCH.find(value) {
                    MatchResult::Partial(None)
                } else {
                    MatchResult::Consumed(value, Some(value.len()))
                }
            }
            Pattern::Alternatives(_) => {
                panic!("could_match must be called on a normalized Pattern")
            }
            Pattern::Concatenation(list) => {
                let mut iter = list.iter();
                while let Some(part) = iter.next() {
                    match part.match_internal(value, any_offset) {
                        MatchResult::None => return MatchResult::None,
                        MatchResult::Partial(new_pat) => {
                            let mut new = vec![new_pat.unwrap_or_else(|| part.clone())];
                            new.extend(iter.cloned());
                            return MatchResult::Partial(Some(Pattern::Concatenation(new)));
                        }
                        MatchResult::Consumed(new_value, new_any_offset) => {
                            value = new_value;
                            any_offset = new_any_offset;
                        }
                    }
                }
                MatchResult::Consumed(value, any_offset)
            }
        }
    }
}

impl PatternVc {
    pub fn new(pattern: Pattern) -> Self {
        PatternVc::new_internal(Value::new(pattern))
    }
}

#[turbo_tasks::value_impl]
impl PatternVc {
    fn new_internal(pattern: Value<Pattern>) -> Self {
        Self::slot(pattern.into_value())
    }
}

#[derive(PartialEq)]
enum MatchResult<'a> {
    None,
    Partial(Option<Pattern>),
    Consumed(&'a str, Option<usize>),
}

impl<'a> MatchResult<'a> {
    fn is_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial(_) => false,
            MatchResult::Consumed(rem, any) => {
                if let Some(offset) = any {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }
    fn could_match_others(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial(_) => true,
            MatchResult::Consumed(rem, any) => {
                if let Some(offset) = any {
                    *offset == rem.len()
                } else {
                    false
                }
            }
        }
    }
    fn could_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial(_) => true,
            MatchResult::Consumed(rem, any) => {
                if let Some(offset) = any {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }
}

impl From<String> for Pattern {
    fn from(s: String) -> Self {
        Pattern::Constant(s)
    }
}

impl Display for Pattern {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Pattern::Constant(c) => write!(f, "\"{c}\""),
            Pattern::Dynamic => write!(f, "<dynamic>"),
            Pattern::Alternatives(list) => write!(
                f,
                "({})",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            Pattern::Concatenation(list) => write!(
                f,
                "{}",
                list.iter()
                    .map(|i| i.to_string())
                    .collect::<Vec<_>>()
                    .join(" ")
            ),
        }
    }
}

#[derive(PartialEq, Eq, Clone)]
pub enum PatternMatch {
    File(String, FileSystemPathVc),
    Directory(String, FileSystemPathVc),
}

#[turbo_tasks::function]
pub async fn read_matches(
    context: FileSystemPathVc,
    prefix: String,
    force_in_context: bool,
    pattern: PatternVc,
) -> Result<Vc<Vec<PatternMatch>>> {
    let context_name = turbo_tasks::ValueToString::to_string(&context).await?;
    let pat = pattern.get().await?;
    let mut results = Vec::new();
    let mut nested = Vec::new();
    if !force_in_context {
        let parent_path = format!("{prefix}..");
        if pat.is_match(&parent_path) {
            results.push(PatternMatch::Directory(
                parent_path.clone(),
                context.clone().parent(),
            ));
        }
        let parent_path = format!("{prefix}../");
        if pat.is_match(&parent_path) {
            results.push(PatternMatch::Directory(
                parent_path.clone(),
                context.clone().parent(),
            ));
        }
        if pat.could_match(&parent_path) {
            nested.push(read_matches(
                context.clone().parent(),
                parent_path.clone(),
                false,
                pattern.clone(),
            ));
        }
    }
    {
        let self_path = format!("{prefix}.");
        if pat.is_match(&self_path) {
            results.push(PatternMatch::Directory(self_path.clone(), context.clone()));
        }
    }
    if prefix.is_empty() {
        if pat.is_match("./") {
            results.push(PatternMatch::Directory("./".to_string(), context.clone()));
        }
        if pat.could_match("./") {
            nested.push(read_matches(
                context.clone(),
                "./".to_string(),
                false,
                pattern.clone(),
            ));
        }
    }
    match &*context.read_dir().await? {
        DirectoryContent::Entries(map) => {
            for (key, entry) in map.iter() {
                match entry {
                    DirectoryEntry::File(path) => {
                        let full_path = format!("{prefix}{key}");
                        if pat.is_match(&full_path) {
                            results.push(PatternMatch::File(full_path, path.clone()));
                        }
                    }
                    DirectoryEntry::Directory(path) => {
                        let mut full_path = format!("{prefix}{key}");
                        if full_path.ends_with("/") {
                            full_path.pop();
                        }
                        if pat.is_match(&full_path) {
                            results.push(PatternMatch::Directory(full_path, path.clone()));
                        }
                        let full_dir_path = format!("{prefix}{key}/");
                        if pat.is_match(&full_dir_path) {
                            results
                                .push(PatternMatch::Directory(full_dir_path.clone(), path.clone()));
                        }
                        if pat.could_match(&full_dir_path) {
                            nested.push(read_matches(
                                path.clone(),
                                full_dir_path,
                                true,
                                pattern.clone(),
                            ));
                        }
                    }
                    DirectoryEntry::Other(_) => {}
                    DirectoryEntry::Error => {}
                }
            }
        }
        DirectoryContent::NotFound => {}
    };
    for nested in nested.into_iter() {
        results.extend(nested.await?.iter().cloned());
    }
    Ok(Vc::slot(results))
}

#[cfg(test)]
mod tests {
    use super::Pattern;
    use rstest::*;

    #[test]
    fn is_match() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Constant(".".to_string()),
            Pattern::Constant("/".to_string()),
            Pattern::Dynamic,
            Pattern::Constant(".js".to_string()),
        ]);
        assert!(pat.could_match(""));
        assert!(pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(pat.is_match("./index.js"));
        assert!(!pat.is_match("./index"));

        // forbidden:
        assert!(!pat.is_match("./../index.js"));
        assert!(!pat.is_match("././index.js"));
        assert!(!pat.is_match("./.git/index.js"));
        assert!(!pat.is_match("./inner/../index.js"));
        assert!(!pat.is_match("./inner/./index.js"));
        assert!(!pat.is_match("./inner/.git/index.js"));
        assert!(!pat.could_match("./../"));
        assert!(!pat.could_match("././"));
        assert!(!pat.could_match("./.git/"));
        assert!(!pat.could_match("./inner/../"));
        assert!(!pat.could_match("./inner/./"));
        assert!(!pat.could_match("./inner/.git/"));
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic)]
    #[case::dynamic_concat(Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(".js".to_string())]))]
    fn dynamic_match(#[case] pat: Pattern) {
        assert!(pat.could_match(""));
        assert!(pat.is_match("index.js"));

        // forbidden:
        assert!(!pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(!pat.could_match("."));
        assert!(!pat.is_match("."));
        assert!(!pat.could_match("../"));
        assert!(!pat.is_match("../"));
        assert!(!pat.could_match(".."));
        assert!(!pat.is_match(".."));
        assert!(!pat.is_match("./../index.js"));
        assert!(!pat.is_match("././index.js"));
        assert!(!pat.is_match("./.git/index.js"));
        assert!(!pat.is_match("./inner/../index.js"));
        assert!(!pat.is_match("./inner/./index.js"));
        assert!(!pat.is_match("./inner/.git/index.js"));
        assert!(!pat.could_match("./../"));
        assert!(!pat.could_match("././"));
        assert!(!pat.could_match("./.git/"));
        assert!(!pat.could_match("./inner/../"));
        assert!(!pat.could_match("./inner/./"));
        assert!(!pat.could_match("./inner/.git/"));

        assert!(!pat.could_match("node_modules"));
        assert!(!pat.could_match("node_modules/package"));
        assert!(!pat.could_match("nested/node_modules"));
        assert!(!pat.could_match("nested/node_modules/package"));

        // forbidden match
        assert!(pat.could_match("file.map"));
        assert!(!pat.is_match("file.map"));
        assert!(pat.is_match("file.map/file.js"));
        assert!(!pat.is_match("file.d.ts"));
        assert!(!pat.is_match("file.d.ts.map"));
        assert!(!pat.is_match("file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/inner/file.d.ts.map"));
        assert!(pat.could_match("dir/inner/file.d.ts.map"));
    }
}
