use std::{
    collections::BTreeMap,
    fmt::{Debug, Formatter},
    future::Future,
};

use patricia_tree::PatriciaMap;
use serde::{
    de::{MapAccess, Visitor},
    ser::SerializeMap,
    Deserialize, Deserializer, Serialize, Serializer,
};
use serde_bytes::{ByteBuf, Bytes};
use turbo_rcstr::RcStr;
use turbo_tasks::{
    debug::{internal::PassthroughDebug, ValueDebugFormat, ValueDebugFormatString},
    trace::{TraceRawVcs, TraceRawVcsContext},
    NonLocalValue,
};

use super::pattern::Pattern;

/// A map of [`AliasPattern`]s to the [`Template`]s they resolve to.
///
/// If a pattern has a wildcard character (*) within it, it will capture any
/// number of characters, including path separators. The result of the capture
/// will then be passed to the template.
///
/// If the pattern does not have a wildcard character, it will only match the
/// exact string, and return the template as-is.
#[derive(Clone)]
pub struct AliasMap<T> {
    map: PatriciaMap<BTreeMap<AliasKey, T>>,
}

impl<T> Default for AliasMap<T> {
    fn default() -> Self {
        Self::new()
    }
}

impl<T> PartialEq for AliasMap<T>
where
    T: PartialEq,
{
    fn eq(&self, other: &Self) -> bool {
        if self.map.len() != other.map.len() {
            return false;
        }

        self.map.iter().zip(other.map.iter()).all(|(a, b)| a == b)
    }
}

impl<T> Eq for AliasMap<T> where T: Eq {}

impl<T> Serialize for AliasMap<T>
where
    T: Serialize,
{
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        let mut map = serializer.serialize_map(Some(self.map.len()))?;
        for (prefix, value) in self.map.iter() {
            let key = ByteBuf::from(prefix);
            map.serialize_entry(&key, value)?;
        }
        map.end()
    }
}

struct AliasMapVisitor<T> {
    marker: std::marker::PhantomData<T>,
}

impl<'de, T> Visitor<'de> for AliasMapVisitor<T>
where
    T: Deserialize<'de>,
{
    type Value = AliasMap<T>;

    fn expecting(&self, formatter: &mut std::fmt::Formatter) -> std::fmt::Result {
        formatter.write_str("a map of alias patterns to templates")
    }

    fn visit_map<M>(self, mut access: M) -> Result<Self::Value, M::Error>
    where
        M: MapAccess<'de>,
    {
        let mut map = AliasMap::new();
        while let Some((key, value)) = access.next_entry::<&Bytes, _>()? {
            map.map.insert(key, value);
        }
        Ok(map)
    }
}

impl<'a, T> Deserialize<'a> for AliasMap<T>
where
    T: Deserialize<'a>,
{
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'a>,
    {
        deserializer.deserialize_map(AliasMapVisitor {
            marker: std::marker::PhantomData,
        })
    }
}

impl<T> TraceRawVcs for AliasMap<T>
where
    T: TraceRawVcs,
{
    fn trace_raw_vcs(&self, trace_context: &mut TraceRawVcsContext) {
        for (_, map) in self.map.iter() {
            for value in map.values() {
                value.trace_raw_vcs(trace_context);
            }
        }
    }
}

unsafe impl<T: NonLocalValue> NonLocalValue for AliasMap<T> {}

impl<T> ValueDebugFormat for AliasMap<T>
where
    T: ValueDebugFormat,
{
    fn value_debug_format(&self, depth: usize) -> ValueDebugFormatString {
        if depth == 0 {
            return ValueDebugFormatString::Sync(std::any::type_name::<Self>().to_string());
        }

        let values = self
            .map
            .iter()
            .flat_map(|(key, map)| {
                let key = String::from_utf8(key).expect("invalid UTF-8 key in AliasMap");
                map.iter().map(move |(alias_key, value)| match alias_key {
                    AliasKey::Exact => (
                        key.clone(),
                        value.value_debug_format(depth.saturating_sub(1)),
                    ),
                    AliasKey::Wildcard { suffix } => (
                        format!("{}*{}", key, suffix),
                        value.value_debug_format(depth.saturating_sub(1)),
                    ),
                })
            })
            .collect::<Vec<_>>();

        ValueDebugFormatString::Async(Box::pin(async move {
            let mut values_string = std::collections::HashMap::new();
            for (key, value) in values {
                match value {
                    ValueDebugFormatString::Sync(string) => {
                        values_string.insert(key, PassthroughDebug::new_string(string));
                    }
                    ValueDebugFormatString::Async(future) => {
                        values_string.insert(key, PassthroughDebug::new_string(future.await?));
                    }
                }
            }
            Ok(format!("{:#?}", values_string))
        }))
    }
}

impl<T> Debug for AliasMap<T>
where
    T: Debug,
{
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        f.debug_map()
            .entries(self.map.iter().flat_map(|(key, map)| {
                let key = String::from_utf8(key).expect("invalid UTF-8 key in AliasMap");
                map.iter().map(move |(alias_key, value)| match alias_key {
                    AliasKey::Exact => (key.clone(), value),
                    AliasKey::Wildcard { suffix } => (format!("{}*{}", key, suffix), value),
                })
            }))
            .finish()
    }
}

impl<T> AliasMap<T> {
    /// Creates a new alias map.
    pub fn new() -> Self {
        AliasMap {
            map: PatriciaMap::new(),
        }
    }

    /// Looks up a request in the alias map.
    ///
    /// Returns an iterator to all the matching aliases.
    pub fn lookup<'a>(&'a self, request: &'a Pattern) -> AliasMapLookupIterator<'a, T>
    where
        T: Debug,
    {
        if matches!(request, Pattern::Alternatives(_)) {
            panic!(
                "AliasMap::lookup must not be called on alternatives, received {:?}",
                request
            );
        }

        // Invariant: prefixes should be sorted by increasing length (base lengths),
        // according to PATTERN_KEY_COMPARE. Since we're using a prefix tree, this is
        // the default behavior of the common prefix iterator.
        let common_prefixes = self
            .map
            .common_prefixes(request.constant_prefix().as_bytes());
        let mut prefixes_stack = common_prefixes
            .map(|(p, tree)| {
                let s = match std::str::from_utf8(p) {
                    Ok(s) => s,
                    Err(e) => std::str::from_utf8(&p[..e.valid_up_to()]).unwrap(),
                };
                (s, tree)
            })
            .collect::<Vec<_>>();
        AliasMapLookupIterator {
            request,
            current_prefix_iterator: prefixes_stack
                .pop()
                .map(|(prefix, map)| (prefix, map.iter())),
            prefixes_stack,
        }
    }

    /// Looks up a request in the alias map, but only returns aliases where the
    /// prefix matches a certain predicate.
    ///
    /// Returns an iterator to all the matching aliases.
    pub fn lookup_with_prefix_predicate<'a>(
        &'a self,
        request: &'a Pattern,
        mut prefix_predicate: impl FnMut(&str) -> bool,
    ) -> AliasMapLookupIterator<'a, T>
    where
        T: Debug,
    {
        // Invariant: prefixes should be sorted by increasing length (base lengths),
        // according to PATTERN_KEY_COMPARE. Since we're using a prefix tree, this is
        // the default behavior of the common prefix iterator.
        let common_prefixes = self
            .map
            .common_prefixes(request.constant_prefix().as_bytes());
        let mut prefixes_stack = common_prefixes
            .filter_map(|(p, tree)| {
                let s = match std::str::from_utf8(p) {
                    Ok(s) => s,
                    Err(e) => std::str::from_utf8(&p[..e.valid_up_to()]).unwrap(),
                };
                if prefix_predicate(s) {
                    Some((s, tree))
                } else {
                    None
                }
            })
            .collect::<Vec<_>>();
        AliasMapLookupIterator {
            request,
            current_prefix_iterator: prefixes_stack
                .pop()
                .map(|(prefix, map)| (prefix, map.iter())),
            prefixes_stack,
        }
    }

    /// Inserts a new alias into the map.
    ///
    /// If the map did not have this alias already, `None` is returned.
    ///
    /// If the map had this alias, the template is updated, and the old template
    /// is returned.
    pub fn insert(&mut self, pattern: AliasPattern, template: T) -> Option<T> {
        let (prefix_key, alias_key, value) = match pattern {
            AliasPattern::Exact(exact) => (exact, AliasKey::Exact, template),
            AliasPattern::Wildcard { prefix, suffix } => {
                (prefix, AliasKey::Wildcard { suffix }, template)
            }
        };
        // NOTE(alexkirsz) patricia_tree doesn't implement std's `Entry` API,
        // where we could do:
        // self.trie
        //     .entry(key.into())
        //     .or_insert_with(BTreeSet::new)
        //     .insert(value)
        if let Some(map) = self.map.get_mut(&prefix_key) {
            map.insert(alias_key, value)
        } else {
            let mut map = BTreeMap::new();
            map.insert(alias_key, value);
            self.map.insert(prefix_key, map);
            None
        }
    }
}

impl<T> IntoIterator for AliasMap<T> {
    type Item = (AliasPattern, T);

    type IntoIter = AliasMapIntoIter<T>;

    fn into_iter(self) -> Self::IntoIter {
        AliasMapIntoIter {
            iter: self.map.into_iter(),
            current_prefix_iterator: None,
        }
    }
}

impl<'a, T> IntoIterator for &'a AliasMap<T> {
    type Item = (AliasPattern, &'a T);

    type IntoIter = AliasMapIter<'a, T>;

    fn into_iter(self) -> Self::IntoIter {
        AliasMapIter {
            iter: self.map.iter(),
            current_prefix_iterator: None,
        }
    }
}

/// An owning iterator over the entries of an `AliasMap`.
///
/// Beware: The items are *NOT* returned in the order defined by
/// [PATTERN_KEY_COMPARE].
///
/// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
pub struct AliasMapIntoIter<T> {
    iter: patricia_tree::map::IntoIter<BTreeMap<AliasKey, T>>,
    current_prefix_iterator: Option<AliasMapIntoIterItem<T>>,
}

struct AliasMapIntoIterItem<T> {
    prefix: RcStr,
    iterator: std::collections::btree_map::IntoIter<AliasKey, T>,
}

impl<T> AliasMapIntoIter<T> {
    fn advance_iter(&mut self) -> Option<&mut AliasMapIntoIterItem<T>> {
        let (prefix, map) = self.iter.next()?;
        let prefix = String::from_utf8(prefix)
            .expect("invalid UTF-8 key in AliasMap")
            .into();
        self.current_prefix_iterator = Some(AliasMapIntoIterItem {
            prefix,
            iterator: map.into_iter(),
        });
        self.current_prefix_iterator.as_mut()
    }
}

impl<T> Iterator for AliasMapIntoIter<T> {
    type Item = (AliasPattern, T);

    fn next(&mut self) -> Option<Self::Item> {
        let mut current_prefix_iterator = match self.current_prefix_iterator {
            None => self.advance_iter()?,
            Some(ref mut current_prefix_iterator) => current_prefix_iterator,
        };
        let mut current_value = current_prefix_iterator.iterator.next();
        loop {
            match current_value {
                None => {
                    current_prefix_iterator = self.advance_iter()?;
                    current_value = current_prefix_iterator.iterator.next();
                }
                Some(current_value) => {
                    return Some(match current_value {
                        (AliasKey::Exact, value) => (
                            AliasPattern::Exact(current_prefix_iterator.prefix.clone()),
                            value,
                        ),
                        (AliasKey::Wildcard { suffix }, value) => (
                            AliasPattern::Wildcard {
                                prefix: current_prefix_iterator.prefix.clone(),
                                suffix,
                            },
                            value,
                        ),
                    });
                }
            }
        }
    }
}

/// A borrowing iterator over the entries of an `AliasMap`.
///
/// Beware: The items are *NOT* returned in the order defined by
/// [PATTERN_KEY_COMPARE].
///
/// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
pub struct AliasMapIter<'a, T> {
    iter: patricia_tree::map::Iter<'a, BTreeMap<AliasKey, T>>,
    current_prefix_iterator: Option<AliasMapIterItem<'a, T>>,
}

struct AliasMapIterItem<'a, T> {
    prefix: RcStr,
    iterator: std::collections::btree_map::Iter<'a, AliasKey, T>,
}

impl<T> AliasMapIter<'_, T> {
    fn advance_iter(&mut self) -> bool {
        let Some((prefix, map)) = self.iter.next() else {
            return false;
        };
        let prefix = String::from_utf8(prefix)
            .expect("invalid UTF-8 key in AliasMap")
            .into();
        self.current_prefix_iterator = Some(AliasMapIterItem {
            prefix,
            iterator: map.iter(),
        });
        true
    }
}

impl<'a, T> Iterator for AliasMapIter<'a, T> {
    type Item = (AliasPattern, &'a T);

    fn next(&mut self) -> Option<Self::Item> {
        let (current_prefix_iterator, current_value) = loop {
            let Some(current_prefix_iterator) = &mut self.current_prefix_iterator else {
                if !self.advance_iter() {
                    return None;
                }
                continue;
            };
            if let Some(current_value) = current_prefix_iterator.iterator.next() {
                break (&*current_prefix_iterator, current_value);
            }
            self.current_prefix_iterator = None;
            continue;
        };
        Some(match current_value {
            (AliasKey::Exact, value) => (
                AliasPattern::Exact(current_prefix_iterator.prefix.clone()),
                value,
            ),
            (AliasKey::Wildcard { suffix }, value) => (
                AliasPattern::Wildcard {
                    prefix: current_prefix_iterator.prefix.clone(),
                    suffix: suffix.clone(),
                },
                value,
            ),
        })
    }
}

impl<T> Extend<(AliasPattern, T)> for AliasMap<T> {
    fn extend<It>(&mut self, iter: It)
    where
        It: IntoIterator<Item = (AliasPattern, T)>,
    {
        for (pattern, value) in iter {
            self.insert(pattern, value);
        }
    }
}

/// An iterator over the aliases that match a request.
///
/// The items are returned in the order defined by [PATTERN_KEY_COMPARE].
///
/// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolution-algorithm-specification
pub struct AliasMapLookupIterator<'a, T> {
    request: &'a Pattern,
    prefixes_stack: Vec<(&'a str, &'a BTreeMap<AliasKey, T>)>,
    current_prefix_iterator: Option<(&'a str, std::collections::btree_map::Iter<'a, AliasKey, T>)>,
}

impl<'a, T> Iterator for AliasMapLookupIterator<'a, T>
where
    T: AliasTemplate,
{
    type Item = AliasMatch<'a, T>;

    fn next(&mut self) -> Option<Self::Item> {
        let (prefix, current_prefix_iterator) = self.current_prefix_iterator.as_mut()?;

        loop {
            for (key, template) in &mut *current_prefix_iterator {
                match key {
                    AliasKey::Exact => {
                        if self.request.is_match(prefix) {
                            return Some(AliasMatch::Exact(template.convert()));
                        }
                    }
                    AliasKey::Wildcard { suffix } => {
                        let mut remaining = self.request.clone();
                        remaining.strip_prefix(prefix.len());
                        let remaining_suffix = remaining.constant_suffix();
                        if !remaining_suffix.ends_with(&**suffix) {
                            continue;
                        }
                        remaining.strip_suffix(suffix.len());

                        let output = template.replace(&remaining);
                        return Some(AliasMatch::Replaced(output));
                    }
                }
            }

            let (new_prefix, new_current_prefix_iterator) = self.prefixes_stack.pop()?;
            *prefix = new_prefix;
            *current_prefix_iterator = new_current_prefix_iterator.iter();
        }
    }
}

/// An alias pattern.
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
pub enum AliasPattern {
    /// Will match an exact string.
    Exact(RcStr),
    /// Will match a pattern with a single wildcard.
    Wildcard { prefix: RcStr, suffix: RcStr },
}

impl AliasPattern {
    /// Parses an alias pattern from a string.
    ///
    /// Wildcard characters (*) present in the string will match any number of
    /// characters, including path separators.
    pub fn parse<'a, T>(pattern: T) -> Self
    where
        T: Into<RcStr> + 'a,
    {
        let pattern = pattern.into();
        if let Some(wildcard_index) = pattern.find('*') {
            let mut pattern = pattern.into_owned();

            let suffix = pattern[wildcard_index + 1..].into();
            pattern.truncate(wildcard_index);
            AliasPattern::Wildcard {
                prefix: pattern.into(),
                suffix,
            }
        } else {
            AliasPattern::Exact(pattern)
        }
    }

    /// Creates a pattern that will only match exactly what was passed in.
    pub fn exact<'a, T>(pattern: T) -> Self
    where
        T: Into<RcStr> + 'a,
    {
        AliasPattern::Exact(pattern.into())
    }

    /// Creates a pattern that will match, sequentially:
    /// 1. a prefix; then
    /// 2. any number of characters, including path separators; then
    /// 3. a suffix.
    pub fn wildcard<'p, 's, P, S>(prefix: P, suffix: S) -> Self
    where
        P: Into<RcStr> + 'p,
        S: Into<RcStr> + 's,
    {
        AliasPattern::Wildcard {
            prefix: prefix.into(),
            suffix: suffix.into(),
        }
    }
}

#[derive(Debug, Clone, Eq, PartialEq, Serialize, Deserialize, TraceRawVcs, NonLocalValue)]
enum AliasKey {
    Exact,
    Wildcard { suffix: RcStr },
}

/// Result of a lookup in the alias map.
#[derive(Debug, PartialEq)]
pub enum AliasMatch<'a, T>
where
    T: AliasTemplate + 'a,
{
    /// The request matched an exact alias.
    Exact(T::Output<'a>),
    /// The request matched a wildcard alias.
    Replaced(T::Output<'a>),
}

impl<'a, T> AliasMatch<'a, T>
where
    T: AliasTemplate,
{
    /// Returns the exact match, if any.
    pub fn as_exact(&self) -> Option<&T::Output<'a>> {
        if let Self::Exact(v) = self {
            Some(v)
        } else {
            None
        }
    }

    /// Returns the replaced match, if any.
    pub fn as_replaced(&self) -> Option<&T::Output<'a>> {
        if let Self::Replaced(v) = self {
            Some(v)
        } else {
            None
        }
    }

    /// Returns the wrapped value.
    pub fn as_self(&self) -> &T::Output<'a> {
        match self {
            Self::Exact(v) => v,
            Self::Replaced(v) => v,
        }
    }
}

impl<'a, T, R, E> AliasMatch<'a, T>
where
    T: AliasTemplate<Output<'a> = Result<R, E>> + Clone,
{
    /// Returns the wrapped value.
    ///
    /// Consumes the match.
    ///
    /// Only implemented when `T::Output` is some `Result<_, _>`.
    pub fn try_into_self(self) -> Result<R, E> {
        Ok(match self {
            Self::Exact(v) => v?,
            Self::Replaced(v) => v?,
        })
    }
}

impl<'a, T, R, E, F> AliasMatch<'a, T>
where
    F: Future<Output = Result<R, E>>,
    T: AliasTemplate<Output<'a> = F> + Clone,
{
    /// Returns the wrapped value.
    ///
    /// Consumes the match.
    ///
    /// Only implemented when `T::Output` is some `impl Future<Result<_, _>>`
    pub async fn try_join_into_self(self) -> Result<R, E> {
        Ok(match self {
            Self::Exact(v) => v.await?,
            Self::Replaced(v) => v.await?,
        })
    }
}

impl PartialOrd for AliasKey {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.cmp(other))
    }
}

impl Ord for AliasKey {
    /// According to [PATTERN_KEY_COMPARE].
    ///
    /// [PATTERN_KEY_COMPARE]: https://nodejs.org/api/esm.html#resolver-algorithm-specification
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        match (self, other) {
            (AliasKey::Wildcard { suffix: l_suffix }, AliasKey::Wildcard { suffix: r_suffix }) => {
                l_suffix
                    .len()
                    .cmp(&r_suffix.len())
                    .reverse()
                    .then_with(|| l_suffix.cmp(r_suffix))
            }
            (AliasKey::Wildcard { .. }, _) => std::cmp::Ordering::Less,
            (_, AliasKey::Wildcard { .. }) => std::cmp::Ordering::Greater,
            _ => std::cmp::Ordering::Equal,
        }
    }
}

/// A trait for types that can be used as a template for an alias.
pub trait AliasTemplate {
    /// The type of the output of the replacement.
    type Output<'a>
    where
        Self: 'a;

    /// Turn `self` into a `Self::Output`
    fn convert(&self) -> Self::Output<'_>;

    /// Replaces `capture` within `self`.
    fn replace<'a>(&'a self, capture: &Pattern) -> Self::Output<'a>;
}

#[cfg(test)]
mod test {
    use std::assert_matches::assert_matches;

    use super::{AliasMap, AliasPattern, AliasTemplate};
    use crate::resolve::pattern::Pattern;

    /// Asserts that an [`AliasMap`] lookup yields the expected results. The
    /// order of the results is important.
    ///
    /// See below for usage examples.
    macro_rules! assert_alias_matches {
        ($map:expr, $request:expr$(, $($tail:tt)*)?) => {
            let request = Pattern::Constant($request.into());
            let mut lookup = $map.lookup(&request);

            $(assert_alias_matches!(@next lookup, $($tail)*);)?
            assert_matches!(lookup.next(), None);
        };

        (@next $lookup:ident, exact($pattern:expr)$(, $($tail:tt)*)?) => {
            match $lookup.next().unwrap() {
                super::AliasMatch::Exact(Pattern::Constant(c)) if c == $pattern => {}
                m => panic!("unexpected match {:?}", m),
            }
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        (@next $lookup:ident, replaced($pattern:expr)$(, $($tail:tt)*)?) => {
            match $lookup.next().unwrap() {
                super::AliasMatch::Replaced(Pattern::Constant(c)) if c == $pattern => {}
                m => panic!("unexpected match {:?}", m),
            }
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        (@next $lookup:ident, replaced_owned($value:expr)$(, $($tail:tt)*)?) => {
            match $lookup.next().unwrap() {
                super::AliasMatch::Replaced(Pattern::Constant(c)) if c == $value => {}
                m => panic!("unexpected match {:?}", m),
            }
            $(assert_alias_matches!(@next $lookup, $($tail)*);)?
        };

        // Handle trailing comma.
        (@next $lookup:ident,) => {};
    }

    impl<'a> AliasTemplate for &'a str {
        type Output<'b>
            = Pattern
        where
            Self: 'b;

        fn replace(&self, capture: &Pattern) -> Self::Output<'a> {
            capture.spread_into_star(self)
        }

        fn convert(&self) -> Self::Output<'a> {
            Pattern::Constant(self.to_string().into())
        }
    }

    #[test]
    fn test_one_exact() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo"), "bar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", exact("bar"));
        assert_alias_matches!(map, "foobar");
    }

    #[test]
    fn test_many_exact() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo"), "bar");
        map.insert(AliasPattern::parse("bar"), "foo");
        map.insert(AliasPattern::parse("foobar"), "barfoo");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", exact("bar"));
        assert_alias_matches!(map, "bar", exact("foo"));
        assert_alias_matches!(map, "foobar", exact("barfoo"));
    }

    #[test]
    fn test_empty() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse(""), "empty");
        map.insert(AliasPattern::parse("foo"), "bar");

        assert_alias_matches!(map, "", exact("empty"));
        assert_alias_matches!(map, "foo", exact("bar"));
    }

    #[test]
    fn test_left_wildcard() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*"), "bar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced("bar"));
        assert_alias_matches!(map, "foobar", replaced("bar"));
    }

    #[test]
    fn test_wildcard_replace_suffix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*"), "bar*");
        map.insert(AliasPattern::parse("foofoo*"), "barbar*");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced_owned("bar"));
        assert_alias_matches!(map, "foobar", replaced_owned("barbar"));
        assert_alias_matches!(
            map,
            "foofoobar",
            // The longer prefix should come first.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_prefix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("*foo"), "*bar");
        map.insert(AliasPattern::parse("*foofoo"), "*barbar");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo", replaced_owned("bar"));
        assert_alias_matches!(map, "barfoo", replaced_owned("barbar"));
        assert_alias_matches!(
            map,
            "barfoofoo",
            // The longer suffix should come first.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_infix() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("foo*foo"), "bar*bar");
        map.insert(AliasPattern::parse("foo*foofoo"), "bar*barbar");
        map.insert(AliasPattern::parse("foofoo*foo"), "bazbaz*baz");

        assert_alias_matches!(map, "");
        assert_alias_matches!(map, "foo");
        assert_alias_matches!(map, "foofoo", replaced_owned("barbar"));
        assert_alias_matches!(map, "foobazfoo", replaced_owned("barbazbar"));
        assert_alias_matches!(
            map,
            "foofoofoo",
            // The longer prefix should come first.
            replaced_owned("bazbazbaz"),
            // Then the longer suffix.
            replaced_owned("barbarbar"),
            replaced_owned("barfoobar"),
        );
        assert_alias_matches!(
            map,
            "foobazfoofoo",
            // The longer suffix should come first.
            replaced_owned("barbazbarbar"),
            replaced_owned("barbazfoobar"),
        );
        assert_alias_matches!(
            map,
            "foofoobarfoo",
            // The longer prefix should come first.
            replaced_owned("bazbazbarbaz"),
            replaced_owned("barfoobarbar"),
        );
        assert_alias_matches!(
            map,
            "foofoofoofoofoo",
            // The longer prefix should come first.
            replaced_owned("bazbazfoofoobaz"),
            // Then the longer suffix.
            replaced_owned("barfoofoobarbar"),
            replaced_owned("barfoofoofoobar"),
        );
    }

    #[test]
    fn test_wildcard_replace_only() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("*"), "foo*foo");
        map.insert(AliasPattern::parse("**"), "bar*foo");

        assert_alias_matches!(map, "", replaced_owned("foofoo"));
        assert_alias_matches!(map, "bar", replaced_owned("foobarfoo"));
        assert_alias_matches!(
            map,
            "*",
            replaced_owned("barfoo"),
            replaced_owned("foo*foo"),
        );
        assert_alias_matches!(
            map,
            "**",
            replaced_owned("bar*foo"),
            replaced_owned("foo**foo")
        );
    }

    #[test]
    fn test_pattern() {
        let mut map = AliasMap::new();
        map.insert(AliasPattern::parse("card/*"), "src/cards/*");
        map.insert(AliasPattern::parse("comp/*/x"), "src/comps/*/x");
        map.insert(AliasPattern::parse("head/*/x"), "src/heads/*");

        assert_eq!(
            map.lookup(&Pattern::Concatenation(vec![
                Pattern::Constant("card/".into()),
                Pattern::Dynamic
            ]))
            .collect::<Vec<_>>(),
            vec![super::AliasMatch::Replaced(Pattern::Concatenation(vec![
                Pattern::Constant("src/cards/".into()),
                Pattern::Dynamic
            ]))]
        );
        assert_eq!(
            map.lookup(&Pattern::Concatenation(vec![
                Pattern::Constant("comp/".into()),
                Pattern::Dynamic,
                Pattern::Constant("/x".into()),
            ]))
            .collect::<Vec<_>>(),
            vec![super::AliasMatch::Replaced(Pattern::Concatenation(vec![
                Pattern::Constant("src/comps/".into()),
                Pattern::Dynamic,
                Pattern::Constant("/x".into()),
            ]))]
        );
        assert_eq!(
            map.lookup(&Pattern::Concatenation(vec![
                Pattern::Constant("head/".into()),
                Pattern::Dynamic,
                Pattern::Constant("/x".into()),
            ]))
            .collect::<Vec<_>>(),
            vec![super::AliasMatch::Replaced(Pattern::Concatenation(vec![
                Pattern::Constant("src/heads/".into()),
                Pattern::Dynamic,
            ]))]
        );
    }
}
