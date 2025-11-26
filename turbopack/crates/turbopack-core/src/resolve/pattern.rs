use std::{
    collections::{VecDeque, hash_map::Entry},
    mem::take,
    sync::LazyLock,
};

use anyhow::{Result, bail};
use regex::Regex;
use rustc_hash::{FxHashMap, FxHashSet};
use serde::{Deserialize, Serialize};
use tracing::Instrument;
use turbo_rcstr::{RcStr, rcstr};
use turbo_tasks::{
    NonLocalValue, TaskInput, ValueToString, Vc, debug::ValueDebugFormat, trace::TraceRawVcs,
};
use turbo_tasks_fs::{
    FileSystemPath, LinkContent, LinkType, RawDirectoryContent, RawDirectoryEntry,
};
use turbo_unix_path::normalize_path;

#[turbo_tasks::value]
#[derive(Hash, Clone, Debug, Default)]
pub enum Pattern {
    Constant(RcStr),
    #[default]
    Dynamic,
    DynamicNoSlash,
    Alternatives(Vec<Pattern>),
    Concatenation(Vec<Pattern>),
}

/// manually implement TaskInput to avoid recursion in the implementation of `resolve_input` in the
/// derived implementation.  We can instead use the default implementation since `Pattern` contains
/// no VCs.
impl TaskInput for Pattern {
    fn is_transient(&self) -> bool {
        // We contain no vcs so they cannot be transient.
        false
    }
}

fn concatenation_push_or_merge_item(list: &mut Vec<Pattern>, pat: Pattern) {
    if let Pattern::Constant(ref s) = pat
        && let Some(Pattern::Constant(last)) = list.last_mut()
    {
        let mut buf = last.to_string();
        buf.push_str(s);
        *last = buf.into();
        return;
    }
    list.push(pat);
}

fn concatenation_push_front_or_merge_item(list: &mut Vec<Pattern>, pat: Pattern) {
    if let Pattern::Constant(s) = pat {
        if let Some(Pattern::Constant(first)) = list.iter_mut().next() {
            let mut buf = s.into_owned();
            buf.push_str(first);

            *first = buf.into();
            return;
        }
        list.insert(0, Pattern::Constant(s));
    } else {
        list.insert(0, pat);
    }
}

fn concatenation_extend_or_merge_items(
    list: &mut Vec<Pattern>,
    mut iter: impl Iterator<Item = Pattern>,
) {
    if let Some(first) = iter.next() {
        concatenation_push_or_merge_item(list, first);
        list.extend(iter);
    }
}

fn longest_common_prefix<'a>(strings: &[&'a str]) -> &'a str {
    if strings.is_empty() {
        return "";
    }
    if let [single] = strings {
        return single;
    }
    let first = strings[0];
    let mut len = first.len();
    for str in &strings[1..] {
        len = std::cmp::min(
            len,
            // TODO these are Unicode Scalar Values, not graphemes
            str.chars()
                .zip(first.chars())
                .take_while(|&(a, b)| a == b)
                .count(),
        );
    }
    &first[..len]
}

fn longest_common_suffix<'a>(strings: &[&'a str]) -> &'a str {
    if strings.is_empty() {
        return "";
    }
    let first = strings[0];
    let mut len = first.len();
    for str in &strings[1..] {
        len = std::cmp::min(
            len,
            // TODO these are Unicode Scalar Values, not graphemes
            str.chars()
                .rev()
                .zip(first.chars().rev())
                .take_while(|&(a, b)| a == b)
                .count(),
        );
    }
    &first[(first.len() - len)..]
}

impl Pattern {
    // TODO this should be removed in favor of pattern resolving
    pub fn as_constant_string(&self) -> Option<&RcStr> {
        match self {
            Pattern::Constant(str) => Some(str),
            _ => None,
        }
    }

    /// Whether the pattern has any significant constant parts (everything except `/`).
    /// E.g. `<dynamic>/<dynamic>` doesn't really have constant parts
    pub fn has_constant_parts(&self) -> bool {
        match self {
            Pattern::Constant(str) => str != "/",
            Pattern::Dynamic | Pattern::DynamicNoSlash => false,
            Pattern::Alternatives(list) | Pattern::Concatenation(list) => {
                list.iter().any(|p| p.has_constant_parts())
            }
        }
    }

    pub fn has_dynamic_parts(&self) -> bool {
        match self {
            Pattern::Constant(_) => false,
            Pattern::Dynamic | Pattern::DynamicNoSlash => true,
            Pattern::Alternatives(list) | Pattern::Concatenation(list) => {
                list.iter().any(|p| p.has_dynamic_parts())
            }
        }
    }

    pub fn constant_prefix(&self) -> &str {
        // The normalized pattern is an Alternative of maximally merged
        // Concatenations, so extracting the first/only Concatenation child
        // elements is enough.

        if let Pattern::Constant(c) = self {
            return c;
        }

        fn collect_constant_prefix<'a: 'b, 'b>(pattern: &'a Pattern, result: &mut Vec<&'b str>) {
            match pattern {
                Pattern::Constant(c) => {
                    result.push(c.as_str());
                }
                Pattern::Concatenation(list) => {
                    if let Some(Pattern::Constant(first)) = list.first() {
                        result.push(first.as_str());
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for constant_prefix a Pattern must be normalized");
                }
                Pattern::Dynamic | Pattern::DynamicNoSlash => {}
            }
        }

        let mut strings: Vec<&str> = vec![];
        match self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                collect_constant_prefix(c, &mut strings);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    collect_constant_prefix(c, &mut strings);
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {}
        }
        longest_common_prefix(&strings)
    }

    pub fn constant_suffix(&self) -> &str {
        // The normalized pattern is an Alternative of maximally merged
        // Concatenations, so extracting the first/only Concatenation child
        // elements is enough.

        fn collect_constant_suffix<'a: 'b, 'b>(pattern: &'a Pattern, result: &mut Vec<&'b str>) {
            match pattern {
                Pattern::Constant(c) => {
                    result.push(c.as_str());
                }
                Pattern::Concatenation(list) => {
                    if let Some(Pattern::Constant(first)) = list.last() {
                        result.push(first.as_str());
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for constant_suffix a Pattern must be normalized");
                }
                Pattern::Dynamic | Pattern::DynamicNoSlash => {}
            }
        }

        let mut strings: Vec<&str> = vec![];
        match self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                collect_constant_suffix(c, &mut strings);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    collect_constant_suffix(c, &mut strings);
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {}
        }
        longest_common_suffix(&strings)
    }

    pub fn strip_prefix(&self, prefix: &str) -> Result<Option<Self>> {
        if self.must_match(prefix) {
            let mut pat = self.clone();
            pat.strip_prefix_len(prefix.len())?;
            Ok(Some(pat))
        } else {
            Ok(None)
        }
    }

    pub fn strip_prefix_len(&mut self, len: usize) -> Result<()> {
        fn strip_prefix_internal(pattern: &mut Pattern, chars_to_strip: &mut usize) -> Result<()> {
            match pattern {
                Pattern::Constant(c) => {
                    let c_len = c.len();
                    if *chars_to_strip >= c_len {
                        *c = rcstr!("");
                    } else {
                        *c = (&c[*chars_to_strip..]).into();
                    }
                    *chars_to_strip = (*chars_to_strip).saturating_sub(c_len);
                }
                Pattern::Concatenation(list) => {
                    for c in list {
                        if *chars_to_strip > 0 {
                            strip_prefix_internal(c, chars_to_strip)?;
                        }
                    }
                }
                Pattern::Alternatives(_) => {
                    bail!("strip_prefix pattern must be normalized");
                }
                Pattern::Dynamic | Pattern::DynamicNoSlash => {
                    bail!("strip_prefix prefix is too long");
                }
            }
            Ok(())
        }

        match &mut *self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                let mut len_local = len;
                strip_prefix_internal(c, &mut len_local)?;
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    let mut len_local = len;
                    strip_prefix_internal(c, &mut len_local)?;
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                if len > 0 {
                    bail!(
                        "strip_prefix prefix ({}) is too long: {}",
                        len,
                        self.describe_as_string()
                    );
                }
            }
        };

        self.normalize();

        Ok(())
    }

    pub fn strip_suffix_len(&mut self, len: usize) {
        fn strip_suffix_internal(pattern: &mut Pattern, chars_to_strip: &mut usize) {
            match pattern {
                Pattern::Constant(c) => {
                    let c_len = c.len();
                    if *chars_to_strip >= c_len {
                        *c = rcstr!("");
                    } else {
                        *c = (&c[..(c_len - *chars_to_strip)]).into();
                    }
                    *chars_to_strip = (*chars_to_strip).saturating_sub(c_len);
                }
                Pattern::Concatenation(list) => {
                    for c in list.iter_mut().rev() {
                        if *chars_to_strip > 0 {
                            strip_suffix_internal(c, chars_to_strip);
                        }
                    }
                }
                Pattern::Alternatives(_) => {
                    panic!("for strip_suffix a Pattern must be normalized");
                }
                Pattern::Dynamic | Pattern::DynamicNoSlash => {
                    panic!("strip_suffix suffix is too long");
                }
            }
        }

        match &mut *self {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                let mut len_local = len;
                strip_suffix_internal(c, &mut len_local);
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    let mut len_local = len;
                    strip_suffix_internal(c, &mut len_local);
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                if len > 0 {
                    panic!("strip_suffix suffix is too long");
                }
            }
        };

        self.normalize()
    }

    /// Replace all `*`s in `template` with self.
    ///
    /// Handle top-level alternatives separately so that multiple star placeholders
    /// match the same pattern instead of the whole alternative.
    pub fn spread_into_star(&self, template: &str) -> Pattern {
        if template.contains("*") {
            let alternatives: Box<dyn Iterator<Item = &Pattern>> = match self {
                Pattern::Alternatives(list) => Box::new(list.iter()),
                c => Box::new(std::iter::once(c)),
            };

            let mut result = Pattern::alternatives(alternatives.map(|pat| {
                let mut split = template.split("*");
                let mut concatenation: Vec<Pattern> = Vec::with_capacity(3);

                // There are at least two elements in the iterator
                concatenation.push(Pattern::Constant(split.next().unwrap().into()));

                for part in split {
                    concatenation.push(pat.clone());
                    if !part.is_empty() {
                        concatenation.push(Pattern::Constant(part.into()));
                    }
                }
                Pattern::Concatenation(concatenation)
            }));

            result.normalize();
            result
        } else {
            Pattern::Constant(template.into())
        }
    }

    /// Appends something to end the pattern.
    pub fn extend(&mut self, concatenated: impl Iterator<Item = Self>) {
        if let Pattern::Concatenation(list) = self {
            concatenation_extend_or_merge_items(list, concatenated);
        } else {
            let mut vec = vec![take(self)];
            for item in concatenated {
                if let Pattern::Concatenation(more) = item {
                    concatenation_extend_or_merge_items(&mut vec, more.into_iter());
                } else {
                    concatenation_push_or_merge_item(&mut vec, item);
                }
            }
            *self = Pattern::Concatenation(vec);
        }
    }

    /// Appends something to end the pattern.
    pub fn push(&mut self, pat: Pattern) {
        if let Pattern::Constant(this) = &*self
            && this.is_empty()
        {
            // Short-circuit to replace empty constants with the appended pattern
            *self = pat;
            return;
        }
        if let Pattern::Constant(pat) = &pat
            && pat.is_empty()
        {
            // Short-circuit to ignore when trying to append an empty string.
            return;
        }

        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(more)) => {
                concatenation_extend_or_merge_items(list, more.into_iter());
            }
            (Pattern::Concatenation(list), pat) => {
                concatenation_push_or_merge_item(list, pat);
            }
            (this, Pattern::Concatenation(mut list)) => {
                concatenation_push_front_or_merge_item(&mut list, take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(other)) => {
                let mut buf = str.to_string();
                buf.push_str(&other);
                *str = buf.into();
            }
            (this, pat) => {
                *this = Pattern::Concatenation(vec![take(this), pat]);
            }
        }
    }

    /// Prepends something to front of the pattern.
    pub fn push_front(&mut self, pat: Pattern) {
        match (self, pat) {
            (Pattern::Concatenation(list), Pattern::Concatenation(mut more)) => {
                concatenation_extend_or_merge_items(&mut more, take(list).into_iter());
                *list = more;
            }
            (Pattern::Concatenation(list), pat) => {
                concatenation_push_front_or_merge_item(list, pat);
            }
            (this, Pattern::Concatenation(mut list)) => {
                concatenation_push_or_merge_item(&mut list, take(this));
                *this = Pattern::Concatenation(list);
            }
            (Pattern::Constant(str), Pattern::Constant(other)) => {
                let mut buf = other.into_owned();

                buf.push_str(str);
                *str = buf.into();
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

    pub fn concat(items: impl IntoIterator<Item = Pattern>) -> Self {
        let mut items = items.into_iter();
        let mut current = items.next().unwrap_or_default();
        for item in items {
            current.push(item);
        }
        current
    }

    /// Normalizes paths by
    /// - processing path segments: `.` and `..`
    /// - normalizing windows filepaths by replacing `\` with `/`
    ///
    /// The Pattern must have already been processed by [Self::normalize].
    /// Returns [Option::None] if any of the patterns attempt to navigate out of the root.
    pub fn with_normalized_path(&self) -> Option<Pattern> {
        let mut new = self.clone();

        #[derive(Debug)]
        enum PathElement {
            Segment(Pattern),
            Separator,
        }

        fn normalize_path_internal(pattern: &mut Pattern) -> Option<()> {
            match pattern {
                Pattern::Constant(c) => {
                    let normalized = c.replace('\\', "/");
                    *c = RcStr::from(normalize_path(normalized.as_str())?);
                    Some(())
                }
                Pattern::Dynamic | Pattern::DynamicNoSlash => Some(()),
                Pattern::Concatenation(list) => {
                    let mut segments = Vec::new();
                    for segment in list.iter() {
                        match segment {
                            Pattern::Constant(str) => {
                                let mut iter = str.split('/').peekable();
                                while let Some(segment) = iter.next() {
                                    match segment {
                                        "." | "" => {
                                            // Ignore empty segments
                                            continue;
                                        }
                                        ".." => {
                                            if segments.is_empty() {
                                                // Leaving root
                                                return None;
                                            }

                                            if let Some(PathElement::Separator) = segments.last()
                                                && let Some(PathElement::Segment(
                                                    Pattern::Constant(_),
                                                )) = segments.get(segments.len() - 2)
                                            {
                                                // Resolve `foo/..`
                                                segments.truncate(segments.len() - 2);
                                                continue;
                                            }

                                            // Keep it, can't pop non-constant segment.
                                            segments.push(PathElement::Segment(Pattern::Constant(
                                                rcstr!(".."),
                                            )));
                                        }
                                        segment => {
                                            segments.push(PathElement::Segment(Pattern::Constant(
                                                segment.into(),
                                            )));
                                        }
                                    }

                                    if iter.peek().is_some() {
                                        // If not last, add separator
                                        segments.push(PathElement::Separator);
                                    }
                                }
                            }
                            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                                segments.push(PathElement::Segment(segment.clone()));
                            }
                            Pattern::Alternatives(_) | Pattern::Concatenation(_) => {
                                panic!("for with_normalized_path the Pattern must be normalized");
                            }
                        }
                    }
                    let separator = rcstr!("/");
                    *list = segments
                        .into_iter()
                        .map(|c| match c {
                            PathElement::Segment(p) => p,
                            PathElement::Separator => Pattern::Constant(separator.clone()),
                        })
                        .collect();
                    Some(())
                }
                Pattern::Alternatives(_) => {
                    panic!("for with_normalized_path the Pattern must be normalized");
                }
            }
        }

        match &mut new {
            c @ Pattern::Constant(_) | c @ Pattern::Concatenation(_) => {
                normalize_path_internal(c)?;
            }
            Pattern::Alternatives(list) => {
                for c in list {
                    normalize_path_internal(c)?;
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {}
        }

        new.normalize();
        Some(new)
    }

    /// Order into Alternatives -> Concatenation -> Constant/Dynamic
    /// Merge when possible
    pub fn normalize(&mut self) {
        match self {
            Pattern::Dynamic | Pattern::DynamicNoSlash | Pattern::Constant(_) => {
                // already normalized
            }
            Pattern::Alternatives(list) => {
                for alt in list.iter_mut() {
                    alt.normalize();
                }
                let mut new_alternatives = Vec::new();
                let mut has_dynamic = false;
                for alt in list.drain(..) {
                    if let Pattern::Alternatives(inner) = alt {
                        for alt in inner {
                            if alt == Pattern::Dynamic {
                                if !has_dynamic {
                                    has_dynamic = true;
                                    new_alternatives.push(alt);
                                }
                            } else {
                                new_alternatives.push(alt);
                            }
                        }
                    } else if alt == Pattern::Dynamic {
                        if !has_dynamic {
                            has_dynamic = true;
                            new_alternatives.push(alt);
                        }
                    } else {
                        new_alternatives.push(alt);
                    }
                }
                if new_alternatives.len() == 1 {
                    *self = new_alternatives.into_iter().next().unwrap();
                } else {
                    *list = new_alternatives;
                }
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
                            new_alternatives = combined;
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
                    // The recursive call will deduplicate the alternatives after simplifying them
                    self.normalize();
                } else {
                    let mut new_parts = Vec::new();
                    for part in list.drain(..) {
                        fn add_part(part: Pattern, new_parts: &mut Vec<Pattern>) {
                            match part {
                                Pattern::Constant(c) => {
                                    if !c.is_empty() {
                                        if let Some(Pattern::Constant(last)) = new_parts.last_mut()
                                        {
                                            let mut buf = last.to_string();
                                            buf.push_str(&c);
                                            *last = buf.into();
                                        } else {
                                            new_parts.push(Pattern::Constant(c));
                                        }
                                    }
                                }
                                Pattern::Dynamic => {
                                    if let Some(Pattern::Dynamic | Pattern::DynamicNoSlash) =
                                        new_parts.last()
                                    {
                                        // do nothing
                                    } else {
                                        new_parts.push(Pattern::Dynamic);
                                    }
                                }
                                Pattern::DynamicNoSlash => {
                                    if let Some(Pattern::DynamicNoSlash) = new_parts.last() {
                                        // do nothing
                                    } else {
                                        new_parts.push(Pattern::DynamicNoSlash);
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
                    if new_parts.len() == 1 {
                        *self = new_parts.into_iter().next().unwrap();
                    } else {
                        *list = new_parts;
                    }
                }
            }
        }
    }

    pub fn is_empty(&self) -> bool {
        match self {
            Pattern::Constant(s) => s.is_empty(),
            Pattern::Dynamic | Pattern::DynamicNoSlash => false,
            Pattern::Concatenation(parts) => parts.iter().all(|p| p.is_empty()),
            Pattern::Alternatives(parts) => parts.iter().all(|p| p.is_empty()),
        }
    }

    pub fn filter_could_match(&self, value: &str) -> Option<Pattern> {
        if let Pattern::Alternatives(list) = self {
            let new_list = list
                .iter()
                .filter(|alt| alt.could_match(value))
                .cloned()
                .collect::<Vec<_>>();
            if new_list.is_empty() {
                None
            } else {
                Some(Pattern::Alternatives(new_list))
            }
        } else if self.could_match(value) {
            Some(self.clone())
        } else {
            None
        }
    }

    pub fn filter_could_not_match(&self, value: &str) -> Option<Pattern> {
        if let Pattern::Alternatives(list) = self {
            let new_list = list
                .iter()
                .filter(|alt| !alt.could_match(value))
                .cloned()
                .collect::<Vec<_>>();
            if new_list.is_empty() {
                None
            } else {
                Some(Pattern::Alternatives(new_list))
            }
        } else if self.could_match(value) {
            None
        } else {
            Some(self.clone())
        }
    }

    pub fn split_could_match(&self, value: &str) -> (Option<Pattern>, Option<Pattern>) {
        if let Pattern::Alternatives(list) = self {
            let mut could_match_list = Vec::new();
            let mut could_not_match_list = Vec::new();
            for alt in list.iter() {
                if alt.could_match(value) {
                    could_match_list.push(alt.clone());
                } else {
                    could_not_match_list.push(alt.clone());
                }
            }
            (
                if could_match_list.is_empty() {
                    None
                } else if could_match_list.len() == 1 {
                    Some(could_match_list.into_iter().next().unwrap())
                } else {
                    Some(Pattern::Alternatives(could_match_list))
                },
                if could_not_match_list.is_empty() {
                    None
                } else if could_not_match_list.len() == 1 {
                    Some(could_not_match_list.into_iter().next().unwrap())
                } else {
                    Some(Pattern::Alternatives(could_not_match_list))
                },
            )
        } else if self.could_match(value) {
            (Some(self.clone()), None)
        } else {
            (None, Some(self.clone()))
        }
    }

    pub fn is_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter().any(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .is_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .is_match()
        }
    }

    /// Like [`Pattern::is_match`], but does not consider any dynamic
    /// pattern matching
    pub fn is_match_ignore_dynamic(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter().any(|alt| {
                alt.match_internal(value, None, InNodeModules::False, true)
                    .is_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, true)
                .is_match()
        }
    }

    pub fn match_position(&self, value: &str) -> Option<usize> {
        if let Pattern::Alternatives(list) = self {
            list.iter().position(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .is_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .is_match()
                .then_some(0)
        }
    }

    pub fn could_match_others(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter().any(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .could_match_others()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .could_match_others()
        }
    }

    /// Returns true if all matches of the pattern start with `value`.
    pub fn must_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter().all(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .could_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .could_match()
        }
    }

    /// Returns true the pattern could match something that starts with `value`.
    pub fn could_match(&self, value: &str) -> bool {
        if let Pattern::Alternatives(list) = self {
            list.iter().any(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .could_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .could_match()
        }
    }

    pub fn could_match_position(&self, value: &str) -> Option<usize> {
        if let Pattern::Alternatives(list) = self {
            list.iter().position(|alt| {
                alt.match_internal(value, None, InNodeModules::False, false)
                    .could_match()
            })
        } else {
            self.match_internal(value, None, InNodeModules::False, false)
                .could_match()
                .then_some(0)
        }
    }
    fn match_internal<'a>(
        &self,
        mut value: &'a str,
        mut any_offset: Option<usize>,
        mut in_node_modules: InNodeModules,
        ignore_dynamic: bool,
    ) -> MatchResult<'a> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            MatchResult::Consumed {
                                remaining: &value[index + c.len()..],
                                any_offset: None,
                                in_node_modules: InNodeModules::check(c),
                            }
                        } else {
                            MatchResult::None
                        }
                    } else if offset >= value.len() {
                        MatchResult::Partial
                    } else {
                        MatchResult::None
                    }
                } else if value.starts_with(&**c) {
                    MatchResult::Consumed {
                        remaining: &value[c.len()..],
                        any_offset: None,
                        in_node_modules: InNodeModules::check(c),
                    }
                } else if c.starts_with(value) {
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                static FORBIDDEN: LazyLock<Regex> = LazyLock::new(|| {
                    Regex::new(r"(/|^)(ROOT|\.|/|(node_modules|__tests?__)(/|$))").unwrap()
                });
                static FORBIDDEN_MATCH: LazyLock<Regex> =
                    LazyLock::new(|| Regex::new(r"\.d\.ts$|\.map$").unwrap());
                if in_node_modules == InNodeModules::FolderSlashMatched
                    || (in_node_modules == InNodeModules::FolderMatched && value.starts_with('/'))
                {
                    MatchResult::None
                } else if let Some(m) = FORBIDDEN.find(value) {
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(m.start()),
                        in_node_modules: InNodeModules::False,
                    }
                } else if FORBIDDEN_MATCH.find(value).is_some() {
                    MatchResult::Partial
                } else if ignore_dynamic {
                    MatchResult::None
                } else {
                    let match_length = matches!(self, Pattern::DynamicNoSlash)
                        .then(|| value.find("/"))
                        .flatten()
                        .unwrap_or(value.len());
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(match_length),
                        in_node_modules: InNodeModules::False,
                    }
                }
            }
            Pattern::Alternatives(_) => {
                panic!("for matching a Pattern must be normalized {self:?}")
            }
            Pattern::Concatenation(list) => {
                for part in list {
                    match part.match_internal(value, any_offset, in_node_modules, ignore_dynamic) {
                        MatchResult::None => return MatchResult::None,
                        MatchResult::Partial => return MatchResult::Partial,
                        MatchResult::Consumed {
                            remaining: new_value,
                            any_offset: new_any_offset,
                            in_node_modules: new_in_node_modules,
                        } => {
                            value = new_value;
                            any_offset = new_any_offset;
                            in_node_modules = new_in_node_modules
                        }
                    }
                }
                MatchResult::Consumed {
                    remaining: value,
                    any_offset,
                    in_node_modules,
                }
            }
        }
    }

    /// Same as `match_internal`, but additionally pushing matched dynamic elements into the given
    /// result list.
    fn match_collect_internal<'a>(
        &self,
        mut value: &'a str,
        mut any_offset: Option<usize>,
        mut in_node_modules: InNodeModules,
        dynamics: &mut VecDeque<&'a str>,
    ) -> MatchResult<'a> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            if index > 0 {
                                dynamics.push_back(&value[..index]);
                            }
                            MatchResult::Consumed {
                                remaining: &value[index + c.len()..],
                                any_offset: None,
                                in_node_modules: InNodeModules::check(c),
                            }
                        } else {
                            MatchResult::None
                        }
                    } else if offset >= value.len() {
                        MatchResult::Partial
                    } else {
                        MatchResult::None
                    }
                } else if value.starts_with(&**c) {
                    MatchResult::Consumed {
                        remaining: &value[c.len()..],
                        any_offset: None,
                        in_node_modules: InNodeModules::check(c),
                    }
                } else if c.starts_with(value) {
                    MatchResult::Partial
                } else {
                    MatchResult::None
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                static FORBIDDEN: LazyLock<Regex> = LazyLock::new(|| {
                    Regex::new(r"(/|^)(ROOT|\.|/|(node_modules|__tests?__)(/|$))").unwrap()
                });
                static FORBIDDEN_MATCH: LazyLock<Regex> =
                    LazyLock::new(|| Regex::new(r"\.d\.ts$|\.map$").unwrap());
                if in_node_modules == InNodeModules::FolderSlashMatched
                    || (in_node_modules == InNodeModules::FolderMatched && value.starts_with('/'))
                {
                    MatchResult::None
                } else if let Some(m) = FORBIDDEN.find(value) {
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(m.start()),
                        in_node_modules: InNodeModules::False,
                    }
                } else if FORBIDDEN_MATCH.find(value).is_some() {
                    MatchResult::Partial
                } else {
                    let match_length = matches!(self, Pattern::DynamicNoSlash)
                        .then(|| value.find("/"))
                        .flatten()
                        .unwrap_or(value.len());
                    MatchResult::Consumed {
                        remaining: value,
                        any_offset: Some(match_length),
                        in_node_modules: InNodeModules::False,
                    }
                }
            }
            Pattern::Alternatives(_) => {
                panic!("for matching a Pattern must be normalized {self:?}")
            }
            Pattern::Concatenation(list) => {
                for part in list {
                    match part.match_collect_internal(value, any_offset, in_node_modules, dynamics)
                    {
                        MatchResult::None => return MatchResult::None,
                        MatchResult::Partial => return MatchResult::Partial,
                        MatchResult::Consumed {
                            remaining: new_value,
                            any_offset: new_any_offset,
                            in_node_modules: new_in_node_modules,
                        } => {
                            value = new_value;
                            any_offset = new_any_offset;
                            in_node_modules = new_in_node_modules
                        }
                    }
                }
                if let Some(offset) = any_offset
                    && offset == value.len()
                {
                    dynamics.push_back(value);
                }
                MatchResult::Consumed {
                    remaining: value,
                    any_offset,
                    in_node_modules,
                }
            }
        }
    }

    pub fn next_constants<'a>(&'a self, value: &str) -> Option<Vec<(&'a str, bool)>> {
        if let Pattern::Alternatives(list) = self {
            let mut results = Vec::new();
            for alt in list.iter() {
                match alt.next_constants_internal(value, None) {
                    NextConstantUntilResult::NoMatch => {}
                    NextConstantUntilResult::PartialDynamic => {
                        return None;
                    }
                    NextConstantUntilResult::Partial(s, end) => {
                        results.push((s, end));
                    }
                    NextConstantUntilResult::Consumed(rem, None) => {
                        if rem.is_empty() {
                            results.push(("", true));
                        }
                    }
                    NextConstantUntilResult::Consumed(rem, Some(any)) => {
                        if any == rem.len() {
                            // can match anything
                            // we don't have constant only matches
                            return None;
                        }
                    }
                }
            }
            Some(results)
        } else {
            match self.next_constants_internal(value, None) {
                NextConstantUntilResult::NoMatch => None,
                NextConstantUntilResult::PartialDynamic => None,
                NextConstantUntilResult::Partial(s, e) => Some(vec![(s, e)]),
                NextConstantUntilResult::Consumed(_, _) => None,
            }
        }
    }

    fn next_constants_internal<'a, 'b>(
        &'a self,
        mut value: &'b str,
        mut any_offset: Option<usize>,
    ) -> NextConstantUntilResult<'a, 'b> {
        match self {
            Pattern::Constant(c) => {
                if let Some(offset) = any_offset {
                    if let Some(index) = value.find(&**c) {
                        if index <= offset {
                            NextConstantUntilResult::Consumed(&value[index + c.len()..], None)
                        } else {
                            NextConstantUntilResult::NoMatch
                        }
                    } else if offset >= value.len() {
                        NextConstantUntilResult::PartialDynamic
                    } else {
                        NextConstantUntilResult::NoMatch
                    }
                } else if let Some(stripped) = value.strip_prefix(&**c) {
                    NextConstantUntilResult::Consumed(stripped, None)
                } else if let Some(stripped) = c.strip_prefix(value) {
                    NextConstantUntilResult::Partial(stripped, true)
                } else {
                    NextConstantUntilResult::NoMatch
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {
                static FORBIDDEN: LazyLock<Regex> = LazyLock::new(|| {
                    Regex::new(r"(/|^)(\.|(node_modules|__tests?__)(/|$))").unwrap()
                });
                static FORBIDDEN_MATCH: LazyLock<Regex> =
                    LazyLock::new(|| Regex::new(r"\.d\.ts$|\.map$").unwrap());
                if let Some(m) = FORBIDDEN.find(value) {
                    NextConstantUntilResult::Consumed(value, Some(m.start()))
                } else if FORBIDDEN_MATCH.find(value).is_some() {
                    NextConstantUntilResult::PartialDynamic
                } else {
                    NextConstantUntilResult::Consumed(value, Some(value.len()))
                }
            }
            Pattern::Alternatives(_) => {
                panic!("for next_constants() the Pattern must be normalized");
            }
            Pattern::Concatenation(list) => {
                let mut iter = list.iter();
                while let Some(part) = iter.next() {
                    match part.next_constants_internal(value, any_offset) {
                        NextConstantUntilResult::NoMatch => {
                            return NextConstantUntilResult::NoMatch;
                        }
                        NextConstantUntilResult::PartialDynamic => {
                            return NextConstantUntilResult::PartialDynamic;
                        }
                        NextConstantUntilResult::Partial(r, end) => {
                            return NextConstantUntilResult::Partial(
                                r,
                                end && iter.next().is_none(),
                            );
                        }
                        NextConstantUntilResult::Consumed(new_value, new_any_offset) => {
                            value = new_value;
                            any_offset = new_any_offset;
                        }
                    }
                }
                NextConstantUntilResult::Consumed(value, any_offset)
            }
        }
    }

    pub fn or_any_nested_file(&self) -> Self {
        let mut new = self.clone();
        new.push(Pattern::Constant(rcstr!("/")));
        new.push(Pattern::Dynamic);
        new.normalize();
        Pattern::alternatives([self.clone(), new])
    }

    /// Calls `cb` on all constants that are at the end of the pattern and
    /// replaces the given final constant with the returned pattern. Returns
    /// true if replacements were performed.
    pub fn replace_final_constants(&mut self, cb: &impl Fn(&RcStr) -> Option<Pattern>) -> bool {
        let mut replaced = false;
        match self {
            Pattern::Constant(c) => {
                if let Some(replacement) = cb(c) {
                    *self = replacement;
                    replaced = true;
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {}
            Pattern::Alternatives(list) => {
                for i in list {
                    replaced = i.replace_final_constants(cb) || replaced;
                }
            }
            Pattern::Concatenation(list) => {
                if let Some(i) = list.last_mut() {
                    replaced = i.replace_final_constants(cb) || replaced;
                }
            }
        }
        replaced
    }

    /// Calls `cb` on all constants and replaces the them with the returned pattern. Returns true if
    /// replacements were performed.
    pub fn replace_constants(&mut self, cb: &impl Fn(&RcStr) -> Option<Pattern>) -> bool {
        let mut replaced = false;
        match self {
            Pattern::Constant(c) => {
                if let Some(replacement) = cb(c) {
                    *self = replacement;
                    replaced = true;
                }
            }
            Pattern::Dynamic | Pattern::DynamicNoSlash => {}
            Pattern::Concatenation(list) | Pattern::Alternatives(list) => {
                for i in list {
                    replaced = i.replace_constants(cb) || replaced;
                }
            }
        }
        replaced
    }

    /// Matches the given string against self, and applies the match onto the target pattern.
    ///
    /// The two patterns should have a similar structure (same number of alternatives and dynamics)
    /// and only differ in the constant contents.
    pub fn match_apply_template(&self, value: &str, target: &Pattern) -> Option<String> {
        let match_idx = self.match_position(value)?;
        let source = match self {
            Pattern::Alternatives(list) => list.get(match_idx),
            Pattern::Constant(_) | Pattern::Dynamic | Pattern::Concatenation(_)
                if match_idx == 0 =>
            {
                Some(self)
            }
            _ => None,
        }?;
        let target = match target {
            Pattern::Alternatives(list) => list.get(match_idx),
            Pattern::Constant(_) | Pattern::Dynamic | Pattern::Concatenation(_)
                if match_idx == 0 =>
            {
                Some(target)
            }
            _ => None,
        }?;

        let mut dynamics = VecDeque::new();
        // This is definitely a match, because it matched above in `self.match_position(value)`
        source.match_collect_internal(value, None, InNodeModules::False, &mut dynamics);

        let mut result = "".to_string();
        match target {
            Pattern::Constant(c) => result.push_str(c),
            Pattern::Dynamic | Pattern::DynamicNoSlash => result.push_str(dynamics.pop_front()?),
            Pattern::Concatenation(list) => {
                for c in list {
                    match c {
                        Pattern::Constant(c) => result.push_str(c),
                        Pattern::Dynamic | Pattern::DynamicNoSlash => {
                            result.push_str(dynamics.pop_front()?)
                        }
                        Pattern::Alternatives(_) | Pattern::Concatenation(_) => {
                            panic!("Pattern must be normalized")
                        }
                    }
                }
            }
            Pattern::Alternatives(_) => panic!("Pattern must be normalized"),
        }
        if !dynamics.is_empty() {
            return None;
        }

        Some(result)
    }
}

impl Pattern {
    pub fn new(mut pattern: Pattern) -> Vc<Self> {
        pattern.normalize();
        Pattern::new_internal(pattern)
    }
}

#[turbo_tasks::value_impl]
impl Pattern {
    #[turbo_tasks::function]
    fn new_internal(pattern: Pattern) -> Vc<Self> {
        Self::cell(pattern)
    }
}

#[derive(PartialEq, Debug)]
enum InNodeModules {
    False,
    // Inside of a match ending in `node_modules`
    FolderMatched,
    // Inside of a match ending in `node_modules/`
    FolderSlashMatched,
}
impl InNodeModules {
    fn check(value: &str) -> Self {
        if value.ends_with("node_modules/") {
            InNodeModules::FolderSlashMatched
        } else if value.ends_with("node_modules") {
            InNodeModules::FolderMatched
        } else {
            InNodeModules::False
        }
    }
}

#[derive(PartialEq, Debug)]
enum MatchResult<'a> {
    /// No match
    None,
    /// Matches only a part of the pattern before reaching the end of the string
    Partial,
    /// Matches the whole pattern (but maybe not the whole string)
    Consumed {
        /// Part of the string remaining after matching the whole pattern
        remaining: &'a str,
        /// Set when the pattern ends with a dynamic part. The dynamic part
        /// could match n bytes more of the string.
        any_offset: Option<usize>,
        /// Set when the pattern ends with `node_modules` or `node_modules/` (and a following
        /// Pattern::Dynamic would thus match all existing packages)
        in_node_modules: InNodeModules,
    },
}

impl MatchResult<'_> {
    /// Returns true if the whole pattern matches the whole string
    fn is_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => false,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
                in_node_modules: _,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }

    /// Returns true if (at least a part of) the pattern matches the whole
    /// string and can also match more bytes in the string
    fn could_match_others(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => true,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
                in_node_modules: _,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    false
                }
            }
        }
    }

    /// Returns true if (at least a part of) the pattern matches the whole
    /// string
    fn could_match(&self) -> bool {
        match self {
            MatchResult::None => false,
            MatchResult::Partial => true,
            MatchResult::Consumed {
                remaining: rem,
                any_offset,
                in_node_modules: _,
            } => {
                if let Some(offset) = any_offset {
                    *offset == rem.len()
                } else {
                    rem.is_empty()
                }
            }
        }
    }
}

#[derive(PartialEq, Debug)]
enum NextConstantUntilResult<'a, 'b> {
    NoMatch,
    PartialDynamic,
    Partial(&'a str, bool),
    Consumed(&'b str, Option<usize>),
}

impl From<RcStr> for Pattern {
    fn from(s: RcStr) -> Self {
        Pattern::Constant(s)
    }
}

impl Pattern {
    pub fn describe_as_string(&self) -> String {
        match self {
            Pattern::Constant(c) => format!("'{c}'"),
            Pattern::Dynamic => "<dynamic>".to_string(),
            Pattern::DynamicNoSlash => "<dynamic no slash>".to_string(),
            Pattern::Alternatives(list) => format!(
                "({})",
                list.iter()
                    .map(|i| i.describe_as_string())
                    .collect::<Vec<_>>()
                    .join(" | ")
            ),
            Pattern::Concatenation(list) => list
                .iter()
                .map(|i| i.describe_as_string())
                .collect::<Vec<_>>()
                .join(" "),
        }
    }
}

#[turbo_tasks::value_impl]
impl ValueToString for Pattern {
    #[turbo_tasks::function]
    fn to_string(&self) -> Vc<RcStr> {
        Vc::cell(self.describe_as_string().into())
    }
}

#[derive(
    Debug,
    PartialEq,
    Eq,
    Clone,
    TraceRawVcs,
    Serialize,
    Deserialize,
    ValueDebugFormat,
    NonLocalValue,
)]
pub enum PatternMatch {
    File(RcStr, FileSystemPath),
    Directory(RcStr, FileSystemPath),
}

impl PatternMatch {
    pub fn path(&self) -> Vc<FileSystemPath> {
        match self {
            PatternMatch::File(_, path) | PatternMatch::Directory(_, path) => path.clone().cell(),
        }
    }

    pub fn name(&self) -> &str {
        match self {
            PatternMatch::File(name, _) | PatternMatch::Directory(name, _) => name.as_str(),
        }
    }
}

// TODO this isn't super efficient
// avoid storing a large list of matches
#[turbo_tasks::value(transparent)]
pub struct PatternMatches(Vec<PatternMatch>);

/// Find all files or directories that match the provided `pattern` with the
/// specified `lookup_dir` directory. `prefix` is the already matched part of
/// the pattern that leads to the `lookup_dir` directory. When
/// `force_in_lookup_dir` is set, leaving the `lookup_dir` directory by
/// matching `..` is not allowed.
///
/// Symlinks will not be resolved. It's expected that the caller resolves
/// symlinks when they are interested in that.
#[turbo_tasks::function]
pub async fn read_matches(
    lookup_dir: FileSystemPath,
    prefix: RcStr,
    force_in_lookup_dir: bool,
    pattern: Vc<Pattern>,
) -> Result<Vc<PatternMatches>> {
    let mut prefix = prefix.to_string();
    let pat = pattern.await?;
    let mut results = Vec::new();
    let mut nested = Vec::new();
    let slow_path = if let Some(constants) = pat.next_constants(&prefix) {
        if constants
            .iter()
            .all(|(str, until_end)| *until_end || str.contains('/'))
        {
            // Fast path: There is a finite list of possible strings that include at least
            // one path segment We will enumerate the list instead of the
            // directory
            let mut handled = FxHashSet::default();
            let mut read_dir_results = FxHashMap::default();
            for (index, (str, until_end)) in constants.into_iter().enumerate() {
                if until_end {
                    if !handled.insert(str) {
                        continue;
                    }
                    let (parent_path, last_segment) = split_last_segment(str);
                    if last_segment.is_empty() {
                        // This means we don't have a last segment, so we just have a directory
                        let joined = if force_in_lookup_dir {
                            lookup_dir.try_join_inside(parent_path)?
                        } else {
                            lookup_dir.try_join(parent_path)?
                        };
                        let Some(fs_path) = joined else {
                            continue;
                        };
                        results.push((
                            index,
                            PatternMatch::Directory(concat(&prefix, str).into(), fs_path),
                        ));
                        continue;
                    }
                    let entry = read_dir_results.entry(parent_path);
                    let read_dir = match entry {
                        Entry::Occupied(e) => Some(e.into_mut()),
                        Entry::Vacant(e) => {
                            let path_option = if force_in_lookup_dir {
                                lookup_dir.try_join_inside(parent_path)?
                            } else {
                                lookup_dir.try_join(parent_path)?
                            };
                            if let Some(path) = path_option {
                                Some(e.insert((path.raw_read_dir().await?, path)))
                            } else {
                                None
                            }
                        }
                    };
                    let Some((read_dir, parent_fs_path)) = read_dir else {
                        continue;
                    };
                    let RawDirectoryContent::Entries(entries) = &**read_dir else {
                        continue;
                    };
                    let Some(entry) = entries.get(last_segment) else {
                        continue;
                    };
                    match *entry {
                        RawDirectoryEntry::File => {
                            results.push((
                                index,
                                PatternMatch::File(
                                    concat(&prefix, str).into(),
                                    parent_fs_path.join(last_segment)?,
                                ),
                            ));
                        }
                        RawDirectoryEntry::Directory => results.push((
                            index,
                            PatternMatch::Directory(
                                concat(&prefix, str).into(),
                                parent_fs_path.join(last_segment)?,
                            ),
                        )),
                        RawDirectoryEntry::Symlink => {
                            let fs_path = parent_fs_path.join(last_segment)?;
                            let LinkContent::Link { link_type, .. } = &*fs_path.read_link().await?
                            else {
                                continue;
                            };
                            let path = concat(&prefix, str).into();
                            if link_type.contains(LinkType::DIRECTORY) {
                                results.push((index, PatternMatch::Directory(path, fs_path)));
                            } else {
                                results.push((index, PatternMatch::File(path, fs_path)))
                            }
                        }
                        _ => {}
                    }
                } else {
                    let subpath = &str[..=str.rfind('/').unwrap()];
                    if handled.insert(subpath) {
                        let joined = if force_in_lookup_dir {
                            lookup_dir.try_join_inside(subpath)?
                        } else {
                            lookup_dir.try_join(subpath)?
                        };
                        let Some(fs_path) = joined else {
                            continue;
                        };
                        nested.push((
                            0,
                            read_matches(
                                fs_path.clone(),
                                concat(&prefix, subpath).into(),
                                force_in_lookup_dir,
                                pattern,
                            ),
                        ));
                    }
                }
            }
            false
        } else {
            true
        }
    } else {
        true
    };

    if slow_path {
        async {
            // Slow path: There are infinite matches for the pattern
            // We will enumerate the filesystem to find matches
            if !force_in_lookup_dir {
                // {prefix}..
                prefix.push_str("..");
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir.parent()),
                    ));
                }

                // {prefix}../
                prefix.push('/');
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir.parent()),
                    ));
                }
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(lookup_dir.parent(), prefix.clone().into(), false, pattern),
                    ));
                }
                prefix.pop();
                prefix.pop();
                prefix.pop();
            }
            {
                prefix.push('.');
                // {prefix}.
                if let Some(pos) = pat.match_position(&prefix) {
                    results.push((
                        pos,
                        PatternMatch::Directory(prefix.clone().into(), lookup_dir.clone()),
                    ));
                }
                prefix.pop();
            }
            if prefix.is_empty() {
                if let Some(pos) = pat.match_position("./") {
                    results.push((
                        pos,
                        PatternMatch::Directory(rcstr!("./"), lookup_dir.clone()),
                    ));
                }
                if let Some(pos) = pat.could_match_position("./") {
                    nested.push((
                        pos,
                        read_matches(lookup_dir.clone(), rcstr!("./"), false, pattern),
                    ));
                }
            } else {
                prefix.push('/');
                // {prefix}/
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(
                            lookup_dir.clone(),
                            prefix.to_string().into(),
                            false,
                            pattern,
                        ),
                    ));
                }
                prefix.pop();
                prefix.push_str("./");
                // {prefix}./
                if let Some(pos) = pat.could_match_position(&prefix) {
                    nested.push((
                        pos,
                        read_matches(
                            lookup_dir.clone(),
                            prefix.to_string().into(),
                            false,
                            pattern,
                        ),
                    ));
                }
                prefix.pop();
                prefix.pop();
            }
            match &*lookup_dir.raw_read_dir().await? {
                RawDirectoryContent::Entries(map) => {
                    for (key, entry) in map.iter() {
                        match entry {
                            RawDirectoryEntry::File => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key)?;
                                    results.push((
                                        pos,
                                        PatternMatch::File(prefix.clone().into(), path),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Directory => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key)?;
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), path),
                                    ));
                                }
                                prefix.push('/');
                                // {prefix}{key}/
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let path = lookup_dir.join(key)?;
                                    results.push((
                                        pos,
                                        PatternMatch::Directory(prefix.clone().into(), path),
                                    ));
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    let path = lookup_dir.join(key)?;
                                    nested.push((
                                        pos,
                                        read_matches(path, prefix.clone().into(), true, pattern),
                                    ));
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Symlink => {
                                let len = prefix.len();
                                prefix.push_str(key);
                                // {prefix}{key}
                                if prefix.ends_with('/') {
                                    prefix.pop();
                                }
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let fs_path = lookup_dir.join(key)?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                    {
                                        if link_type.contains(LinkType::DIRECTORY) {
                                            results.push((
                                                pos,
                                                PatternMatch::Directory(
                                                    prefix.clone().into(),
                                                    fs_path,
                                                ),
                                            ));
                                        } else {
                                            results.push((
                                                pos,
                                                PatternMatch::File(prefix.clone().into(), fs_path),
                                            ));
                                        }
                                    }
                                }
                                prefix.push('/');
                                if let Some(pos) = pat.match_position(&prefix) {
                                    let fs_path = lookup_dir.join(key)?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                        && link_type.contains(LinkType::DIRECTORY)
                                    {
                                        results.push((
                                            pos,
                                            PatternMatch::Directory(prefix.clone().into(), fs_path),
                                        ));
                                    }
                                }
                                if let Some(pos) = pat.could_match_position(&prefix) {
                                    let fs_path = lookup_dir.join(key)?;
                                    if let LinkContent::Link { link_type, .. } =
                                        &*fs_path.read_link().await?
                                        && link_type.contains(LinkType::DIRECTORY)
                                    {
                                        results.push((
                                            pos,
                                            PatternMatch::Directory(prefix.clone().into(), fs_path),
                                        ));
                                    }
                                }
                                prefix.truncate(len)
                            }
                            RawDirectoryEntry::Other => {}
                        }
                    }
                }
                RawDirectoryContent::NotFound => {}
            };
            anyhow::Ok(())
        }
        .instrument(tracing::trace_span!("read_matches slow_path"))
        .await?;
    }
    if results.is_empty() && nested.len() == 1 {
        Ok(nested.into_iter().next().unwrap().1)
    } else {
        for (pos, nested) in nested.into_iter() {
            results.extend(nested.await?.iter().cloned().map(|p| (pos, p)));
        }
        results.sort_by(|(a, am), (b, bm)| (*a).cmp(b).then_with(|| am.name().cmp(bm.name())));
        Ok(Vc::cell(
            results.into_iter().map(|(_, p)| p).collect::<Vec<_>>(),
        ))
    }
}

fn concat(a: &str, b: &str) -> String {
    let mut result = String::with_capacity(a.len() + b.len());
    result.push_str(a);
    result.push_str(b);
    result
}

/// Returns the parent folder and the last segment of the path. When the last segment is unknown (e.
/// g. when using `../`) it returns the full path and an empty string.
fn split_last_segment(path: &str) -> (&str, &str) {
    if let Some((remaining_path, last_segment)) = path.rsplit_once('/') {
        match last_segment {
            "" => split_last_segment(remaining_path),
            "." => split_last_segment(remaining_path),
            ".." => match split_last_segment(remaining_path) {
                (_, "") => (path, ""),
                (parent_path, _) => split_last_segment(parent_path),
            },
            _ => (remaining_path, last_segment),
        }
    } else {
        match path {
            "" => ("", ""),
            "." => ("", ""),
            ".." => ("..", ""),
            _ => ("", path),
        }
    }
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use rstest::*;
    use turbo_rcstr::{RcStr, rcstr};
    use turbo_tasks_backend::{BackendOptions, TurboTasksBackend, noop_backing_storage};
    use turbo_tasks_fs::{DiskFileSystem, FileSystem};

    use super::{
        Pattern, longest_common_prefix, longest_common_suffix, read_matches, split_last_segment,
    };

    #[test]
    fn longest_common_prefix_test() {
        assert_eq!(longest_common_prefix(&["ab"]), "ab");
        assert_eq!(longest_common_prefix(&["ab", "cd", "ef"]), "");
        assert_eq!(longest_common_prefix(&["ab1", "ab23", "ab456"]), "ab");
        assert_eq!(longest_common_prefix(&["abc", "abc", "abc"]), "abc");
        assert_eq!(longest_common_prefix(&["abc", "a", "abc"]), "a");
    }

    #[test]
    fn longest_common_suffix_test() {
        assert_eq!(longest_common_suffix(&["ab"]), "ab");
        assert_eq!(longest_common_suffix(&["ab", "cd", "ef"]), "");
        assert_eq!(longest_common_suffix(&["1ab", "23ab", "456ab"]), "ab");
        assert_eq!(longest_common_suffix(&["abc", "abc", "abc"]), "abc");
        assert_eq!(longest_common_suffix(&["abc", "c", "abc"]), "c");
    }

    #[test]
    fn normalize() {
        let a = Pattern::Constant(rcstr!("a"));
        let b = Pattern::Constant(rcstr!("b"));
        let c = Pattern::Constant(rcstr!("c"));
        let s = Pattern::Constant(rcstr!("/"));
        let d = Pattern::Dynamic;
        {
            let mut p = Pattern::Concatenation(vec![
                Pattern::Alternatives(vec![a.clone(), b.clone()]),
                s.clone(),
                c.clone(),
            ]);
            p.normalize();
            assert_eq!(
                p,
                Pattern::Alternatives(vec![
                    Pattern::Constant(rcstr!("a/c")),
                    Pattern::Constant(rcstr!("b/c")),
                ])
            );
        }

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Concatenation(vec![
                Pattern::Alternatives(vec![a.clone(), b.clone(), d.clone()]),
                s.clone(),
                Pattern::Alternatives(vec![b.clone(), c.clone(), d.clone()]),
            ]);
            p.normalize();

            assert_eq!(
                p,
                Pattern::Alternatives(vec![
                    Pattern::Constant(rcstr!("a/b")),
                    Pattern::Constant(rcstr!("b/b")),
                    Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!("/b"))]),
                    Pattern::Constant(rcstr!("a/c")),
                    Pattern::Constant(rcstr!("b/c")),
                    Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!("/c"))]),
                    Pattern::Concatenation(vec![Pattern::Constant(rcstr!("a/")), Pattern::Dynamic]),
                    Pattern::Concatenation(vec![Pattern::Constant(rcstr!("b/")), Pattern::Dynamic]),
                    Pattern::Concatenation(vec![
                        Pattern::Dynamic,
                        Pattern::Constant(rcstr!("/")),
                        Pattern::Dynamic
                    ]),
                ])
            );
        }

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Alternatives(vec![a.clone()]);
            p.normalize();

            assert_eq!(p, a);
        }

        #[allow(clippy::redundant_clone)] // alignment
        {
            let mut p = Pattern::Alternatives(vec![Pattern::Dynamic, Pattern::Dynamic]);
            p.normalize();

            assert_eq!(p, Pattern::Dynamic);
        }
    }

    #[test]
    fn with_normalized_path() {
        assert!(
            Pattern::Constant(rcstr!("a/../.."))
                .with_normalized_path()
                .is_none()
        );
        assert_eq!(
            Pattern::Constant(rcstr!("a/b/../c"))
                .with_normalized_path()
                .unwrap(),
            Pattern::Constant(rcstr!("a/c"))
        );
        assert_eq!(
            Pattern::Alternatives(vec![
                Pattern::Constant(rcstr!("a/b/../c")),
                Pattern::Constant(rcstr!("a/b/../c/d"))
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Alternatives(vec![
                Pattern::Constant(rcstr!("a/c")),
                Pattern::Constant(rcstr!("a/c/d"))
            ])
        );
        assert_eq!(
            Pattern::Constant(rcstr!("a/b/"))
                .with_normalized_path()
                .unwrap(),
            Pattern::Constant(rcstr!("a/b"))
        );

        // Dynamic is a segment itself
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("../c"))
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("../c"))
            ])
        );

        // Dynamic is part of a segment
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("../c"))
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("../c"))
            ])
        );
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("src/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".js"))
            ])
            .with_normalized_path()
            .unwrap(),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("src/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".js"))
            ])
        );
    }

    #[test]
    fn is_match() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Constant(rcstr!(".")),
            Pattern::Constant(rcstr!("/")),
            Pattern::Dynamic,
            Pattern::Constant(rcstr!(".js")),
        ]);
        assert!(pat.could_match(""));
        assert!(pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(pat.is_match("./index.js"));
        assert!(!pat.is_match("./index"));
        assert!(pat.is_match("./foo/index.js"));
        assert!(pat.is_match("./foo/bar/index.js"));

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

    #[test]
    fn is_match_dynamic_no_slash() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Constant(rcstr!(".")),
            Pattern::Constant(rcstr!("/")),
            Pattern::DynamicNoSlash,
            Pattern::Constant(rcstr!(".js")),
        ]);
        assert!(pat.could_match(""));
        assert!(pat.could_match("./"));
        assert!(!pat.is_match("./"));
        assert!(pat.is_match("./index.js"));
        assert!(!pat.is_match("./index"));
        assert!(!pat.is_match("./foo/index.js"));
        assert!(!pat.is_match("./foo/bar/index.js"));
    }

    #[test]
    fn constant_prefix() {
        assert_eq!(
            Pattern::Constant(rcstr!("a/b/c.js")).constant_prefix(),
            "a/b/c.js",
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("a/b/x")),
            Pattern::Constant(rcstr!("a/b/y")),
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("a/b/c/")), Pattern::Dynamic]),
        ]);
        assert_eq!(pat.constant_prefix(), "a/b/");
    }

    #[test]
    fn constant_suffix() {
        assert_eq!(
            Pattern::Constant(rcstr!("a/b/c.js")).constant_suffix(),
            "a/b/c.js",
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("a/b/x.js")),
            Pattern::Constant(rcstr!("a/b/y.js")),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b/c/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".js")),
            ]),
        ]);
        assert_eq!(pat.constant_suffix(), ".js");
    }

    #[test]
    fn strip_prefix() {
        fn strip(mut pat: Pattern, n: usize) -> Pattern {
            pat.strip_prefix_len(n).unwrap();
            pat
        }

        assert_eq!(
            strip(Pattern::Constant(rcstr!("a/b")), 0),
            Pattern::Constant(rcstr!("a/b"))
        );

        assert_eq!(
            strip(
                Pattern::Alternatives(vec![
                    Pattern::Constant(rcstr!("a/b/x")),
                    Pattern::Constant(rcstr!("a/b/y")),
                ]),
                2
            ),
            Pattern::Alternatives(vec![
                Pattern::Constant(rcstr!("b/x")),
                Pattern::Constant(rcstr!("b/y")),
            ])
        );

        assert_eq!(
            strip(
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("a/")),
                    Pattern::Constant(rcstr!("b")),
                    Pattern::Constant(rcstr!("/")),
                    Pattern::Constant(rcstr!("y/")),
                    Pattern::Dynamic
                ]),
                4
            ),
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("y/")), Pattern::Dynamic]),
        );
    }

    #[test]
    fn strip_suffix() {
        fn strip(mut pat: Pattern, n: usize) -> Pattern {
            pat.strip_suffix_len(n);
            pat
        }

        assert_eq!(
            strip(Pattern::Constant(rcstr!("a/b")), 0),
            Pattern::Constant(rcstr!("a/b"))
        );

        assert_eq!(
            strip(
                Pattern::Alternatives(vec![
                    Pattern::Constant(rcstr!("x/b/a")),
                    Pattern::Constant(rcstr!("y/b/a")),
                ]),
                2
            ),
            Pattern::Alternatives(vec![
                Pattern::Constant(rcstr!("x/b")),
                Pattern::Constant(rcstr!("y/b")),
            ])
        );

        assert_eq!(
            strip(
                Pattern::Concatenation(vec![
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("/a/")),
                    Pattern::Constant(rcstr!("b")),
                    Pattern::Constant(rcstr!("/")),
                    Pattern::Constant(rcstr!("y/")),
                ]),
                4
            ),
            Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!("/a/")),]),
        );
    }

    #[test]
    fn spread_into_star() {
        let pat = Pattern::Constant(rcstr!("xyz"));
        assert_eq!(
            pat.spread_into_star("before/after"),
            Pattern::Constant(rcstr!("before/after")),
        );

        let pat =
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("a/b/c/")), Pattern::Dynamic]);
        assert_eq!(
            pat.spread_into_star("before/*/after"),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("before/a/b/c/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("/after"))
            ])
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("a/")), Pattern::Dynamic]),
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("b/")), Pattern::Dynamic]),
        ]);
        assert_eq!(
            pat.spread_into_star("before/*/after"),
            Pattern::Alternatives(vec![
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("before/a/")),
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("/after"))
                ]),
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("before/b/")),
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!("/after"))
                ]),
            ])
        );

        let pat = Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("a")),
            Pattern::Constant(rcstr!("b")),
        ]);
        assert_eq!(
            pat.spread_into_star("before/*/*"),
            Pattern::Alternatives(vec![
                Pattern::Constant(rcstr!("before/a/a")),
                Pattern::Constant(rcstr!("before/b/b")),
            ])
        );

        let pat = Pattern::Dynamic;
        assert_eq!(
            pat.spread_into_star("before/*/*"),
            Pattern::Concatenation(vec![
                // TODO currently nothing ensures that both Dynamic parts are equal
                Pattern::Constant(rcstr!("before/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!("/")),
                Pattern::Dynamic
            ])
        );
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic)]
    #[case::dynamic_concat(Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!(".js"))]))]
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
        assert!(!pat.could_match("dir//"));
        assert!(!pat.could_match("dir//dir"));
        assert!(!pat.could_match("dir///dir"));
        assert!(!pat.could_match("/"));
        assert!(!pat.could_match("//"));
        assert!(!pat.could_match("/ROOT/"));

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

    #[rstest]
    #[case::slash(Pattern::Concatenation(vec![Pattern::Constant(rcstr!("node_modules/")),Pattern::Dynamic]))]
    #[case::nested(Pattern::Constant(rcstr!("node_modules")).or_any_nested_file())]
    fn dynamic_match_node_modules(#[case] pat: Pattern) {
        assert!(!pat.is_match("node_modules/package"));
        assert!(!pat.could_match("node_modules/package"));
        assert!(!pat.is_match("node_modules/package/index.js"));
        assert!(!pat.could_match("node_modules/package/index.js"));
    }

    #[rstest]
    fn dynamic_match2() {
        let pat = Pattern::Concatenation(vec![
            Pattern::Dynamic,
            Pattern::Constant(rcstr!("/")),
            Pattern::Dynamic,
        ]);
        assert!(pat.could_match("dir"));
        assert!(pat.could_match("dir/"));
        assert!(pat.is_match("dir/index.js"));

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
        assert!(!pat.could_match("dir//"));
        assert!(!pat.could_match("dir//dir"));
        assert!(!pat.could_match("dir///dir"));
        assert!(!pat.could_match("/ROOT/"));

        assert!(!pat.could_match("node_modules"));
        assert!(!pat.could_match("node_modules/package"));
        assert!(!pat.could_match("nested/node_modules"));
        assert!(!pat.could_match("nested/node_modules/package"));

        // forbidden match
        assert!(pat.could_match("dir/file.map"));
        assert!(!pat.is_match("dir/file.map"));
        assert!(pat.is_match("file.map/file.js"));
        assert!(!pat.is_match("dir/file.d.ts"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/file.d.ts.map"));
        assert!(!pat.is_match("dir/inner/file.d.ts.map"));
        assert!(pat.could_match("dir/inner/file.d.ts.map"));
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic)]
    #[case::dynamic_concat(Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!(".js"))]))]
    #[case::dynamic_concat2(Pattern::Concatenation(vec![
        Pattern::Dynamic,
        Pattern::Constant(rcstr!("/")),
        Pattern::Dynamic,
    ]))]
    #[case::dynamic_alt_concat(Pattern::alternatives(vec![
        Pattern::Concatenation(vec![
            Pattern::Dynamic,
            Pattern::Constant(rcstr!("/")),
            Pattern::Dynamic,
        ]),
        Pattern::Dynamic,
    ]))]
    fn split_could_match(#[case] pat: Pattern) {
        let (abs, rel) = pat.split_could_match("/ROOT/");
        assert!(abs.is_none());
        assert!(rel.is_some());
    }

    #[rstest]
    #[case::dynamic(Pattern::Dynamic, "feijf", None)]
    #[case::dynamic_concat(
        Pattern::Concatenation(vec![Pattern::Dynamic, Pattern::Constant(rcstr!(".js"))]),
        "hello.", None
    )]
    #[case::constant(Pattern::Constant(rcstr!("Hello World")), "Hello ", Some(vec![("World", true)]))]
    #[case::alternatives(
        Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("Hello World")),
            Pattern::Constant(rcstr!("Hello All"))
        ]), "Hello ", Some(vec![("World", true), ("All", true)])
    )]
    #[case::alternatives_non_end(
        Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("Hello World")),
            Pattern::Constant(rcstr!("Hello All")),
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("Hello more")), Pattern::Dynamic])
        ]), "Hello ", Some(vec![("World", true), ("All", true), ("more", false)])
    )]
    #[case::request_with_extensions(
        Pattern::Alternatives(vec![
            Pattern::Constant(rcstr!("./file.js")),
            Pattern::Constant(rcstr!("./file.ts")),
            Pattern::Constant(rcstr!("./file.cjs")),
        ]), "./", Some(vec![("file.js", true), ("file.ts", true), ("file.cjs", true)])
    )]
    fn next_constants(
        #[case] pat: Pattern,
        #[case] value: &str,
        #[case] expected: Option<Vec<(&str, bool)>>,
    ) {
        assert_eq!(pat.next_constants(value), expected);
    }

    #[test]
    fn replace_final_constants() {
        fn f(mut p: Pattern, cb: &impl Fn(&RcStr) -> Option<Pattern>) -> Pattern {
            p.replace_final_constants(cb);
            p
        }

        let js_to_ts_tsx = |c: &RcStr| -> Option<Pattern> {
            c.strip_suffix(".js").map(|rest| {
                let new_ending = Pattern::Alternatives(vec![
                    Pattern::Constant(rcstr!(".ts")),
                    Pattern::Constant(rcstr!(".tsx")),
                    Pattern::Constant(rcstr!(".js")),
                ]);
                if !rest.is_empty() {
                    Pattern::Concatenation(vec![Pattern::Constant(rest.into()), new_ending])
                } else {
                    new_ending
                }
            })
        };

        assert_eq!(
            f(
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!(".")),
                    Pattern::Constant(rcstr!("/")),
                    Pattern::Dynamic,
                    Pattern::Alternatives(vec![
                        Pattern::Constant(rcstr!(".js")),
                        Pattern::Constant(rcstr!(".node")),
                    ])
                ]),
                &js_to_ts_tsx
            ),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!(".")),
                Pattern::Constant(rcstr!("/")),
                Pattern::Dynamic,
                Pattern::Alternatives(vec![
                    Pattern::Alternatives(vec![
                        Pattern::Constant(rcstr!(".ts")),
                        Pattern::Constant(rcstr!(".tsx")),
                        Pattern::Constant(rcstr!(".js")),
                    ]),
                    Pattern::Constant(rcstr!(".node")),
                ])
            ]),
        );
        assert_eq!(
            f(
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!(".")),
                    Pattern::Constant(rcstr!("/")),
                    Pattern::Constant(rcstr!("abc.js")),
                ]),
                &js_to_ts_tsx
            ),
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!(".")),
                Pattern::Constant(rcstr!("/")),
                Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("abc")),
                    Pattern::Alternatives(vec![
                        Pattern::Constant(rcstr!(".ts")),
                        Pattern::Constant(rcstr!(".tsx")),
                        Pattern::Constant(rcstr!(".js")),
                    ])
                ]),
            ])
        );
    }

    #[test]
    fn match_apply_template() {
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".ts")),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("@/a/b/")),
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!(".js")),
                ])
            )
            .as_deref(),
            Some("@/a/b/foo.js")
        );
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("b/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".ts")),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("@/a/b/")),
                    Pattern::Dynamic,
                    Pattern::Constant(rcstr!(".js")),
                ])
            )
            .as_deref(),
            None,
        );
        assert_eq!(
            Pattern::Concatenation(vec![
                Pattern::Constant(rcstr!("a/b/")),
                Pattern::Dynamic,
                Pattern::Constant(rcstr!(".ts")),
            ])
            .match_apply_template(
                "a/b/foo.ts",
                &Pattern::Concatenation(vec![
                    Pattern::Constant(rcstr!("@/a/b/x")),
                    Pattern::Constant(rcstr!(".js")),
                ])
            )
            .as_deref(),
            None,
        );
        assert_eq!(
            Pattern::Concatenation(vec![Pattern::Constant(rcstr!("./sub/")), Pattern::Dynamic])
                .match_apply_template(
                    "./sub/file1",
                    &Pattern::Concatenation(vec![
                        Pattern::Constant(rcstr!("@/sub/")),
                        Pattern::Dynamic
                    ])
                )
                .as_deref(),
            Some("@/sub/file1"),
        );
    }

    #[test]
    fn test_split_last_segment() {
        assert_eq!(split_last_segment(""), ("", ""));
        assert_eq!(split_last_segment("a"), ("", "a"));
        assert_eq!(split_last_segment("a/"), ("", "a"));
        assert_eq!(split_last_segment("a/b"), ("a", "b"));
        assert_eq!(split_last_segment("a/b/"), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c"), ("a/b", "c"));
        assert_eq!(split_last_segment("a/b/."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/.."), ("", "a"));
        assert_eq!(split_last_segment("a/b/c/.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c/../.."), ("", "a"));
        assert_eq!(split_last_segment("a/b/c/d/../.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/c/../d/.."), ("a", "b"));
        assert_eq!(split_last_segment("a/b/../c/d/.."), ("a/b/..", "c"));
        assert_eq!(split_last_segment("."), ("", ""));
        assert_eq!(split_last_segment("./"), ("", ""));
        assert_eq!(split_last_segment(".."), ("..", ""));
        assert_eq!(split_last_segment("../"), ("..", ""));
        assert_eq!(split_last_segment("./../"), ("./..", ""));
        assert_eq!(split_last_segment("../../"), ("../..", ""));
        assert_eq!(split_last_segment("../../."), ("../..", ""));
        assert_eq!(split_last_segment("../.././"), ("../..", ""));
        assert_eq!(split_last_segment("a/.."), ("", ""));
        assert_eq!(split_last_segment("a/../"), ("", ""));
        assert_eq!(split_last_segment("a/../.."), ("a/../..", ""));
        assert_eq!(split_last_segment("a/../../"), ("a/../..", ""));
        assert_eq!(split_last_segment("a/././../"), ("", ""));
        assert_eq!(split_last_segment("../a"), ("..", "a"));
        assert_eq!(split_last_segment("../a/"), ("..", "a"));
        assert_eq!(split_last_segment("../../a"), ("../..", "a"));
        assert_eq!(split_last_segment("../../a/"), ("../..", "a"));
    }

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn test_read_matches() {
        let tt = turbo_tasks::TurboTasks::new(TurboTasksBackend::new(
            BackendOptions::default(),
            noop_backing_storage(),
        ));
        tt.run_once(async {
            let root = DiskFileSystem::new(
                rcstr!("test"),
                Path::new(env!("CARGO_MANIFEST_DIR"))
                    .join("tests/pattern/read_matches")
                    .to_str()
                    .unwrap()
                    .into(),
            )
            .root()
            .owned()
            .await?;

            // node_modules shouldn't be matched by Dynamic here
            assert_eq!(
                vec!["index.js", "sub", "sub/", "sub/foo-a.js", "sub/foo-b.js"],
                read_matches(
                    root.clone(),
                    rcstr!(""),
                    false,
                    Pattern::new(Pattern::Dynamic),
                )
                .await?
                .into_iter()
                .map(|m| m.name())
                .collect::<Vec<_>>()
            );

            // basic dynamic file suffix
            assert_eq!(
                vec!["sub/foo-a.js", "sub/foo-b.js"],
                read_matches(
                    root.clone(),
                    rcstr!(""),
                    false,
                    Pattern::new(Pattern::concat([
                        Pattern::Constant(rcstr!("sub/foo")),
                        Pattern::Dynamic,
                    ])),
                )
                .await?
                .into_iter()
                .map(|m| m.name())
                .collect::<Vec<_>>()
            );

            // read_matches "node_modules/<dynamic>" should not return anything inside. We never
            // want to enumerate the list of packages here.
            assert_eq!(
                vec!["node_modules"] as Vec<&str>,
                read_matches(
                    root.clone(),
                    rcstr!(""),
                    false,
                    Pattern::new(Pattern::Constant(rcstr!("node_modules")).or_any_nested_file()),
                )
                .await?
                .into_iter()
                .map(|m| m.name())
                .collect::<Vec<_>>()
            );

            anyhow::Ok(())
        })
        .await
        .unwrap();
    }
}
