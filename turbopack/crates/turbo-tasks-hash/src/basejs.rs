//! Identifier mangling for generating short, unique JS identifiers.

use std::collections::{HashMap, hash_map::Entry};

use crate::{hash_xxh3_hash64, hash_xxh3_hash64_salt};

const FIRST_CHARS: &[u8; 54] = b"_$ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const REST_CHARS: &[u8; 64] = b"_$0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const ZERO_CHAR: char = '_';
const SINGLE_ITEM_IDENTIFIER: &str = "f";

fn max_value_for_len(len: usize) -> u64 {
    if len == 0 {
        return 0;
    }
    FIRST_CHARS.len() as u64 * (REST_CHARS.len() as u64).saturating_pow((len - 1) as u32) - 1
}

/// Encodes a u64 to a valid JS identifier, trimming trailing `_` (zeros).
/// Always returns at least one character.
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

/// Decodes a JS identifier back to its numeric value. Returns None if invalid
/// for this mapping. Not all JS identifiers are valid in this mapping.
fn decode_js_identifier(s: &str) -> Option<u64> {
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
        multiplier *= REST_CHARS.len() as u64;
    }

    Some(value)
}

/// Mangles identifiers to unique, minimal-length hashes.
///
/// Names already shorter than the hash length are kept as-is.
/// Uses numeric value space - each value maps to exactly one trimmed identifier.
pub fn shorten_to_unique_hashes<K: Eq + std::hash::Hash + Clone>(
    items: impl IntoIterator<Item = (K, String)>,
    min_len: usize,
) -> HashMap<K, String> {
    let mut items: Vec<_> = items.into_iter().collect();

    // No work to be done
    if items.is_empty() {
        return HashMap::default();
    }

    // For a single item, we always call it `SINGLE_ITEM_IDENTIFIER`
    if items.len() == 1 {
        let (key, _) = items.pop().unwrap();
        return HashMap::from([(key, SINGLE_ITEM_IDENTIFIER.to_string())]);
    }

    // 5% fill rate heuristic (like Webpack)
    let optimal_range = items.len() * 20;
    let hash_len = std::cmp::max(
        min_len,
        (optimal_range as f64).log(REST_CHARS.len() as f64).ceil() as usize,
    );

    // Max values for collision resolution tiers
    let max_value = max_value_for_len(hash_len);
    let ext_max = max_value_for_len(hash_len + 1);

    let mut result: HashMap<K, String> = HashMap::default();
    let mut used_values: HashMap<u64, K> = HashMap::default();

    let mut to_mangle = Vec::new();
    for (key, ident) in items {
        // We maintain an identifier iff it is ASCII and short enough (decodes
        // as a JS identifier and length <= hash_len)
        if ident.len() <= hash_len
            && let Some(numeric) = decode_js_identifier(&ident)
        {
            used_values.insert(numeric, key.clone());
            result.insert(key, ident);
        } else {
            to_mangle.push((key, ident));
        }
    }

    if to_mangle.is_empty() {
        return result;
    }

    // Sort by incoming name for deterministic processing
    to_mangle.sort_by(|a, b| a.1.cmp(&b.1));

    for (key, ident) in to_mangle {
        let base_hash = hash_xxh3_hash64(&ident);

        // Tier 1: Try within max_value range
        let truncated = base_hash % (max_value + 1);
        if let Entry::Vacant(e) = used_values.entry(truncated) {
            e.insert(key.clone());
            result.insert(key, encode_js_identifier(truncated));
            continue;
        }

        // Tier 2: Try within ext_max range
        let ext_truncated = base_hash % (ext_max + 1);
        if let Entry::Vacant(e) = used_values.entry(ext_truncated) {
            e.insert(key.clone());
            result.insert(key, encode_js_identifier(ext_truncated));
            continue;
        }

        // Tier 3: Walk salts
        let mut found = false;
        for salt in 0..1_000_000u64 {
            let salted = hash_xxh3_hash64_salt(&ident, salt) % (ext_max + 1);
            if let Entry::Vacant(e) = used_values.entry(salted) {
                e.insert(key.clone());
                result.insert(key, encode_js_identifier(salted));
                found = true;
                break;
            }
        }

        // The probability of this should be near zero since we're using the
        // extended range
        if !found {
            panic!("Failed to find unique hash for {}", ident);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        for val in [0, 1, 52, 53, 54, 55, 100, 1000, 10000, 100000] {
            let encoded = encode_js_identifier(val);
            let decoded = decode_js_identifier(&encoded);
            assert_eq!(decoded, Some(val), "roundtrip failed for {}", val);
        }
    }

    #[test]
    fn test_short_names_preserved() {
        let items = vec![("a", "x".to_string()), ("b", "longExportName".to_string())];
        let result = shorten_to_unique_hashes(items, 1);

        assert_eq!(result.get(&"a"), Some(&"x".to_string()));
        assert_ne!(result.get(&"b"), Some(&"longExportName".to_string()));
    }

    #[test]
    fn test_shorten_unique() {
        let items = vec![
            ("a", "foobar".to_string()),
            ("b", "barbaz".to_string()),
            ("c", "bazqux".to_string()),
        ];
        let result = shorten_to_unique_hashes(items, 1);

        assert_eq!(result.len(), 3);
        let mut hashes: Vec<_> = result.values().cloned().collect();
        hashes.sort();
        hashes.dedup();
        assert_eq!(hashes.len(), 3);
    }

    #[test]
    fn test_shorten_deterministic() {
        let items1 = vec![("a", "foobar".to_string()), ("b", "barbaz".to_string())];
        let items2 = vec![("b", "barbaz".to_string()), ("a", "foobar".to_string())];

        let result1 = shorten_to_unique_hashes(items1, 1);
        let result2 = shorten_to_unique_hashes(items2, 1);

        assert_eq!(result1.get(&"a"), result2.get(&"a"));
        assert_eq!(result1.get(&"b"), result2.get(&"b"));
    }

    #[test]
    fn test_shorten_collision_resolution() {
        let items: Vec<_> = (0..100).map(|i| (i, format!("export_{}", i))).collect();
        let result = shorten_to_unique_hashes(items, 1);

        let mut hashes: Vec<_> = result.values().cloned().collect();
        hashes.sort();
        hashes.dedup();
        assert_eq!(hashes.len(), 100);
    }

    #[test]
    fn test_no_collision_with_preserved_names() {
        let items = vec![
            ("short", "A".to_string()), // numeric value 1
            ("long1", "someLongName1".to_string()),
            ("long2", "someLongName2".to_string()),
        ];
        let result = shorten_to_unique_hashes(items, 1);

        assert_eq!(result.get(&"short"), Some(&"A".to_string()));
        let mut all: Vec<_> = result.values().cloned().collect();
        all.sort();
        all.dedup();
        assert_eq!(all.len(), 3);
    }
}
