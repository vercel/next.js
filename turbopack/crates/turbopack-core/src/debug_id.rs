use turbo_rcstr::RcStr;
use turbo_tasks_fs::rope::Rope;
use twox_hash::xxhash3_128;

/// Generate a deterministic debug ID from content using hash-based UUID generation
///
/// This follows the TC39 debug ID proposal by generating UUIDs that are deterministic
/// based on the content, ensuring reproducible builds while maintaining uniqueness.
/// Uses xxHash3-128 for fast, stable, and collision-resistant hashing.
pub fn generate_debug_id(content: &Rope) -> RcStr {
    let mut hasher = xxhash3_128::Hasher::new();
    for bytes in content.read() {
        hasher.write(bytes.as_ref());
    }
    let hash = hasher.finish_128();
    uuid::Uuid::from_u128(hash)
        .as_hyphenated()
        .to_string()
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_debug_id_deterministic() {
        // Create test content
        let content = Rope::from("console.log('Hello World');");

        // Generate debug ID twice
        let id1 = generate_debug_id(&content);
        let id2 = generate_debug_id(&content);

        // Should be identical (deterministic)
        assert_eq!(id1, id2);

        // Should be valid UUID format (8-4-4-4-12)
        assert_eq!(id1.len(), 36);
        assert!(id1.contains('-'));
    }

    #[test]
    fn test_generate_debug_id_different_content() {
        // Create two different pieces of content
        let content1 = Rope::from("console.log('Hello');");
        let content2 = Rope::from("console.log('World');");

        // Generate debug IDs
        let id1 = generate_debug_id(&content1);
        let id2 = generate_debug_id(&content2);

        // Should be different
        assert_ne!(id1, id2);
    }

    #[test]
    fn test_debug_id_format() {
        let content = Rope::from("test content");
        let debug_id = generate_debug_id(&content);

        // Verify UUID format: 8-4-4-4-12 characters
        let parts: Vec<&str> = debug_id.split('-').collect();
        assert_eq!(parts.len(), 5);
        assert_eq!(parts[0].len(), 8);
        assert_eq!(parts[1].len(), 4);
        assert_eq!(parts[2].len(), 4);
        assert_eq!(parts[3].len(), 4);
        assert_eq!(parts[4].len(), 12);

        // Should be lowercase
        assert_eq!(debug_id, debug_id.to_lowercase());
    }
}
