use std::collections::HashSet;

use const_format::concatcp;
use sourcemap::SourceMap;

use crate::SOURCE_MAP_PREFIX;

pub fn add_default_ignore_list(map: &mut SourceMap) {
    let mut ignored_ids = HashSet::new();

    for (source_id, source) in map.sources().enumerate() {
        if source.starts_with(concatcp!(SOURCE_MAP_PREFIX, "[next]"))
            || source.starts_with(concatcp!(SOURCE_MAP_PREFIX, "[turbopack]"))
            || source.contains("/node_modules/")
        {
            ignored_ids.insert(source_id);
        }
    }

    for ignored_id in ignored_ids {
        map.add_to_ignore_list(ignored_id as _);
    }
}
