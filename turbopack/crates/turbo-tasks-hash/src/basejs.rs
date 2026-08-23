//! Deterministic mangling of names into short, valid JS identifiers.
//!
//! Used to shorten module export keys: the keys only exist to link modules together, so as long
//! as producer and consumer agree on the same short key, the original (possibly very long) name
//! never has to appear in the output.
//!
//! The mapping is built so that names stay **stable** across unrelated changes — a plain
//! sequential assignment (`a`, `b`, `c`, …) would renumber everything whenever a name is added or
//! removed. Instead each name is hashed into a table of all valid identifiers of the chosen
//! length, and collisions are resolved by open addressing (take the next free bucket, wrapping
//! around). With many collisions this degrades to sequential assignment, but in the common case a
//! name's short form only depends on the name itself and the size of the table.

use rustc_hash::{FxHashMap, FxHashSet};

use crate::hash_xxh3_hash64;

/// Characters that may start an identifier. Digits are excluded, so this is one character shorter
/// than [`REST_CHARS`].
const FIRST_CHARS: &[u8; 54] = b"_$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/// Characters that may appear in an identifier after the first character.
const REST_CHARS: &[u8; 64] = b"_$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
/// The character that encodes the value zero. Because it is a legal *leading* character, a value
/// whose encoding would end in it is degenerate (`a` and `a_` would both decode to the same
/// value), so such encodings are never produced and never accepted.
const ZERO_CHAR: char = '_';
/// The name used when only a single name has to be assigned. Any single character would do; `f`
/// is what the original implementation used, and it reads as "function" in the common case.
const SINGLE_ITEM_IDENTIFIER: &str = "f";

/// The number of distinct identifiers of exactly `len` characters, i.e. the capacity of the table
/// for that length. Saturates instead of overflowing for absurd lengths.
fn capacity_for_len(len: u32) -> u64 {
    if len == 0 {
        return 0;
    }
    (FIRST_CHARS.len() as u64).saturating_mul((REST_CHARS.len() as u64).saturating_pow(len - 1))
}

/// The smallest identifier length whose table can hold `count` names.
///
/// This is a pure capacity bound with no headroom: 15 names fit in the single-character table
/// (which holds 54), so they are assigned single-character names.
fn len_for_count(count: u64) -> u32 {
    let mut len = 1;
    while capacity_for_len(len) < count {
        len += 1;
    }
    len
}

/// Encodes a value to a valid JS identifier. Always returns at least one character, and never
/// returns an encoding with a trailing [`ZERO_CHAR`] (those values are the degenerate ones, see
/// [`ZERO_CHAR`]).
pub fn encode_js_identifier(mut value: u64) -> String {
    if value < FIRST_CHARS.len() as u64 {
        // Single character case
        return String::from(FIRST_CHARS[value as usize] as char);
    }

    let mut result = Vec::with_capacity(8);
    result.push(FIRST_CHARS[(value % FIRST_CHARS.len() as u64) as usize]);
    value /= FIRST_CHARS.len() as u64;

    while value > 0 {
        result.push(REST_CHARS[(value % REST_CHARS.len() as u64) as usize]);
        value /= REST_CHARS.len() as u64;
    }

    // SAFETY: FIRST_CHARS and REST_CHARS only contain ASCII
    unsafe { String::from_utf8_unchecked(result) }
}

/// Decodes an identifier back to the value [`encode_js_identifier`] would encode.
///
/// Returns `None` when the string is not in the image of [`encode_js_identifier`] — it contains a
/// character outside the alphabet, or it is a degenerate encoding with trailing zeros. This is
/// what makes the encoding a bijection, which in turn is what lets an existing short name keep
/// its own name without ever colliding with an assigned one.
pub fn decode_js_identifier(s: &str) -> Option<u64> {
    if s.is_empty() {
        return None;
    }
    // Degenerate name: trailing "zeroes"
    if s.ends_with(ZERO_CHAR) && s.len() > 1 {
        return None;
    }
    let bytes = s.as_bytes();

    let first_idx = FIRST_CHARS.iter().position(|&c| c == bytes[0])?;
    let mut value = first_idx as u64;

    let mut multiplier = FIRST_CHARS.len() as u64;
    for &b in &bytes[1..] {
        let idx = REST_CHARS.iter().position(|&c| c == b)?;
        value += idx as u64 * multiplier;
        multiplier = multiplier.checked_mul(REST_CHARS.len() as u64)?;
    }

    Some(value)
}

/// Assigns a short, unique identifier to each of `names`, deterministically.
///
/// The table is sized to the smallest identifier length that can hold `names` (see
/// [`len_for_count`]), and assignment happens in two passes:
///
/// 1. Every name that is *already* a valid identifier of at most that length keeps itself and
///    reserves its bucket. This has to happen for **all** names before anything is hashed, or a
///    hashed name could take a bucket that a later preserved name needs.
/// 2. The remaining names are hashed into the table, resolving collisions by open addressing.
///
/// Both passes iterate in sorted order, so the result depends only on the *set* of names, never on
/// the order they arrive in.
pub fn shorten_to_unique_names<'a>(
    names: impl IntoIterator<Item = &'a str>,
) -> FxHashMap<&'a str, String> {
    let mut names: Vec<&str> = names.into_iter().collect();
    names.sort_unstable();
    names.dedup();

    match names.len() {
        0 => return FxHashMap::default(),
        // A single name doesn't need a table: either it is already short enough to keep, or any
        // single character will do.
        1 => {
            let name = names[0];
            let mangled = if is_preservable(name, 1) {
                name.to_string()
            } else {
                SINGLE_ITEM_IDENTIFIER.to_string()
            };
            return FxHashMap::from_iter([(name, mangled)]);
        }
        _ => {}
    }

    let len = len_for_count(names.len() as u64);
    let capacity = capacity_for_len(len);

    let mut result = FxHashMap::with_capacity_and_hasher(names.len(), Default::default());
    let mut used = FxHashSet::with_capacity_and_hasher(names.len(), Default::default());

    // Pass 1: names that are already valid short identifiers keep themselves and claim their
    // bucket. This must complete before any hashing happens.
    let mut to_mangle = Vec::new();
    for name in names {
        if is_preservable(name, len) {
            // `is_preservable` checked that this decodes.
            used.insert(decode_js_identifier(name).unwrap());
            result.insert(name, name.to_string());
        } else {
            to_mangle.push(name);
        }
    }

    // Pass 2: hash the rest into the table, probing linearly on collision.
    for name in to_mangle {
        let mut bucket = hash_xxh3_hash64(name) % capacity;
        while !used.insert(bucket) {
            bucket = (bucket + 1) % capacity;
        }
        result.insert(name, encode_js_identifier(bucket));
    }

    result
}

/// Whether `name` can be kept as-is in a table of `len`-character identifiers: it has to fit, and
/// it has to be a name the encoding could itself produce (so that it occupies exactly one bucket).
fn is_preservable(name: &str, len: u32) -> bool {
    name.len() as u32 <= len && decode_js_identifier(name).is_some()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn shorten(names: &[&'static str]) -> FxHashMap<&'static str, String> {
        shorten_to_unique_names(names.iter().copied())
    }

    fn assert_all_unique(map: &FxHashMap<&str, String>) {
        let mut values: Vec<_> = map.values().cloned().collect();
        values.sort();
        let before = values.len();
        values.dedup();
        assert_eq!(
            values.len(),
            before,
            "mangled names are not unique: {map:?}"
        );
    }

    #[test]
    fn encode_decode_roundtrip() {
        for value in [
            0,
            1,
            52,
            53,
            54,
            55,
            100,
            1000,
            10_000,
            100_000,
            u32::MAX as u64,
        ] {
            let encoded = encode_js_identifier(value);
            assert_eq!(
                decode_js_identifier(&encoded),
                Some(value),
                "roundtrip failed for {value} ({encoded})"
            );
        }
    }

    #[test]
    fn encoding_never_produces_trailing_zero() {
        for value in 0..20_000u64 {
            let encoded = encode_js_identifier(value);
            assert!(
                encoded.len() == 1 || !encoded.ends_with(ZERO_CHAR),
                "{value} encoded to the degenerate name {encoded}"
            );
        }
    }

    #[test]
    fn degenerate_names_do_not_decode() {
        assert_eq!(decode_js_identifier(""), None);
        assert_eq!(decode_js_identifier("a_"), None);
        assert_eq!(decode_js_identifier("__"), None);
        // Not in the alphabet.
        assert_eq!(decode_js_identifier("a-b"), None);
        assert_eq!(decode_js_identifier("é"), None);
        // A single zero character is fine.
        assert_eq!(decode_js_identifier("_"), Some(0));
    }

    #[test]
    fn table_length_follows_capacity() {
        assert_eq!(capacity_for_len(1), 54);
        assert_eq!(capacity_for_len(2), 54 * 64);

        // The worked example from the requirements: 15 exports fit in one character.
        assert_eq!(len_for_count(15), 1);
        assert_eq!(len_for_count(54), 1);
        assert_eq!(len_for_count(55), 2);

        let names: Vec<String> = (0..15).map(|i| format!("someLongExportName{i}")).collect();
        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(map.len(), 15);
        for mangled in map.values() {
            assert_eq!(
                mangled.chars().count(),
                1,
                "expected 1 character: {mangled}"
            );
        }

        // 55 names no longer fit, so the table grows a character.
        let names: Vec<String> = (0..55).map(|i| format!("someLongExportName{i}")).collect();
        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(map.len(), 55);
        assert!(map.values().any(|m| m.chars().count() == 2));
    }

    #[test]
    fn short_names_are_preserved() {
        let map = shorten(&["a", "longExportName"]);
        assert_eq!(map.get("a").map(String::as_str), Some("a"));
        assert_ne!(map.get("longExportName").map(String::as_str), Some("a"));
        assert_all_unique(&map);
    }

    #[test]
    fn preserved_names_claim_their_bucket_before_hashing() {
        // The preservable name deliberately sorts *last*, so an implementation that assigned
        // hashed names as it walked the list would already have handed out its bucket.
        let mut names: Vec<String> = (0..40).map(|i| format!("exportNumber{i:02}")).collect();
        names.push("z".to_string());
        names.push("A".to_string());
        names.push("$".to_string());

        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(map.get("z").map(String::as_str), Some("z"));
        assert_eq!(map.get("A").map(String::as_str), Some("A"));
        assert_eq!(map.get("$").map(String::as_str), Some("$"));
        // No hashed name stole a preserved name.
        for (name, mangled) in &map {
            if !matches!(*name, "z" | "A" | "$") {
                assert!(
                    !matches!(mangled.as_str(), "z" | "A" | "$"),
                    "{name} was assigned the preserved name {mangled}"
                );
            }
        }
        assert_all_unique(&map);
    }

    #[test]
    fn single_name() {
        assert_eq!(
            shorten(&["someVeryLongExportName"])
                .get("someVeryLongExportName")
                .map(String::as_str),
            Some(SINGLE_ITEM_IDENTIFIER)
        );
        // A single preservable name keeps itself rather than being renamed to `f`.
        assert_eq!(shorten(&["a"]).get("a").map(String::as_str), Some("a"));
    }

    #[test]
    fn empty() {
        assert!(shorten(&[]).is_empty());
    }

    #[test]
    fn unique_under_heavy_collision() {
        let names: Vec<String> = (0..100).map(|i| format!("export_{i}")).collect();
        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(map.len(), 100);
        assert_all_unique(&map);
    }

    #[test]
    fn assignment_is_order_independent() {
        let forward = shorten(&["foobar", "barbaz", "bazqux", "a", "reallyLongName"]);
        let backward = shorten(&["reallyLongName", "a", "bazqux", "barbaz", "foobar"]);
        assert_eq!(forward, backward);
    }

    #[test]
    fn duplicate_names_are_collapsed() {
        let map = shorten(&["foobar", "foobar", "barbaz"]);
        assert_eq!(map.len(), 2);
        assert_all_unique(&map);
    }

    #[test]
    fn collisions_take_the_next_bucket() {
        // Fill the single-character table completely: with 54 names every bucket is taken, so
        // every name still gets a distinct single character — which is only possible if
        // collisions probe to the next free bucket.
        let names: Vec<String> = (0..54).map(|i| format!("collidingExport{i:02}")).collect();
        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(map.len(), 54);
        assert_all_unique(&map);
        for mangled in map.values() {
            assert_eq!(
                mangled.chars().count(),
                1,
                "expected 1 character: {mangled}"
            );
        }
        // And every bucket really is used.
        let mut values: Vec<&str> = map.values().map(String::as_str).collect();
        values.sort_unstable();
        assert_eq!(values.len(), FIRST_CHARS.len());
    }

    #[test]
    fn probing_wraps_around_the_table() {
        // Every bucket but one is claimed by a preserved name; the hashed name therefore has to
        // wrap around the end of the value space to find the only free bucket.
        let free = FIRST_CHARS[7] as char;
        let mut names: Vec<String> = FIRST_CHARS
            .iter()
            .map(|&c| (c as char).to_string())
            .filter(|c| c != &free.to_string())
            .collect();
        names.push("aNameThatNeedsMangling".to_string());

        let map = shorten_to_unique_names(names.iter().map(|s| s.as_str()));
        assert_eq!(
            map.get("aNameThatNeedsMangling").map(String::as_str),
            Some(free.to_string().as_str()),
            "the only free bucket should have been found by wrapping"
        );
        assert_all_unique(&map);
    }

    #[test]
    fn adding_a_name_within_the_same_tier_keeps_others_stable() {
        let before: Vec<String> = (0..20).map(|i| format!("exportNumber{i:02}")).collect();
        let mut after = before.clone();
        after.push("oneMoreExport".to_string());

        let map_before = shorten_to_unique_names(before.iter().map(|s| s.as_str()));
        let map_after = shorten_to_unique_names(after.iter().map(|s| s.as_str()));

        // Same tier, so the modulus is unchanged: only names in the collision cluster of the new
        // name may move. Assert that the overwhelming majority is untouched.
        let moved = map_before
            .iter()
            .filter(|(name, mangled)| map_after.get(**name) != Some(*mangled))
            .count();
        assert!(
            moved <= 2,
            "adding one name moved {moved} of {} existing names",
            map_before.len()
        );
    }
}
