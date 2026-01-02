use std::mem::replace;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ResolvedVc, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileLine, FileLinesContent, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OriginalToken, SourceMap, Token},
};

use crate::compressed_size::compressed_size_bytes;

#[derive(Clone, Debug, Eq, NonLocalValue, PartialEq, TraceRawVcs, Encode, Decode)]
pub struct ChunkPartRange {
    pub line: u32,
    pub start_column: u32,
    pub end_column: u32,
}

#[derive(Clone, Debug, Eq, NonLocalValue, PartialEq, TraceRawVcs, Encode, Decode)]
pub struct ChunkPart {
    pub source: RcStr,
    pub real_size: u32,
    pub unaccounted_size: u32,
    pub lines: ResolvedVc<FileLinesContent>,
    pub ranges: Vec<ChunkPartRange>,
}

impl ChunkPart {
    pub async fn get_compressed_size(&self) -> Result<u32> {
        let lines = &*self.lines.await?;
        let FileLinesContent::Lines(lines) = lines else {
            return Ok(0);
        };

        let mut all_range_content = String::new();
        for range in &self.ranges {
            append_content_between(
                range.line,
                range.start_column,
                range.line,
                range.end_column,
                lines,
                &mut all_range_content,
            );
        }
        compressed_size_bytes(all_range_content.into())
    }
}

#[turbo_tasks::value(transparent)]
#[derive(Debug)]
pub struct ChunkParts(Vec<ChunkPart>);

#[turbo_tasks::function]
pub async fn split_output_asset_into_parts(
    asset: Vc<Box<dyn OutputAsset>>,
) -> Result<Vc<ChunkParts>> {
    let content = asset.content().await?;
    let AssetContent::File(file_content) = &*content else {
        return Ok(Vc::cell(vec![]));
    };
    let FileContent::Content(content) = &*file_content.await? else {
        return Ok(Vc::cell(vec![]));
    };
    let content = content.content();
    let lines_vc = file_content.lines().to_resolved().await?;

    let Some(generate_source_map) =
        Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(asset).await?
    else {
        return self_mapped(asset, content, lines_vc).await;
    };
    let source_map = generate_source_map.generate_source_map().await?;
    let Some(source_map) = source_map.as_content() else {
        return self_mapped(asset, content, lines_vc).await;
    };
    let Some(source_map) = SourceMap::new_from_rope(source_map.content())? else {
        return unaccounted(asset, content, lines_vc).await;
    };

    let lines = lines_vc.await?;
    let FileLinesContent::Lines(lines) = &*lines else {
        return unaccounted(asset, content, lines_vc).await;
    };

    fn end_of_mapping_column(
        start_line: u32,
        end_line: u32,
        end_column: u32,
        lines: &[FileLine],
    ) -> u32 {
        let start_line = start_line.min(lines.len() as u32 - 1);
        let line_end = lines[start_line as usize].len() as u32;
        if start_line == end_line {
            end_column.min(line_end)
        } else {
            line_end
        }
    }

    fn len_between(
        start_line: u32,
        start_column: u32,
        end_line: u32,
        end_column: u32,
        lines: &[FileLine],
    ) -> u32 {
        let start_line = start_line.min(lines.len() as u32 - 1);
        let end_line = end_line.min(lines.len() as u32 - 1);
        if start_line == end_line {
            // TODO: Figure out why start is larger than end sometimes
            return end_column.saturating_sub(start_column);
        }
        let mut len = lines[start_line as usize].len() as u32 - start_column + 1;
        for line in &lines[start_line as usize + 1..end_line as usize] {
            len += line.len() as u32 + 1;
        }
        len += end_column;
        len
    }

    let mut chunk_parts = FxIndexMap::default();
    fn add_chunk_part_range(
        source: RcStr,
        chunk_part_range: ChunkPartRange,
        size: u32,
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
        lines: ResolvedVc<FileLinesContent>,
    ) {
        let entry = chunk_parts
            .entry(source)
            .or_insert_with_key(|source| ChunkPart {
                source: source.clone(),
                real_size: 0,
                unaccounted_size: 0,
                ranges: vec![],
                lines,
            });
        entry.real_size += size;
        entry.ranges.push(chunk_part_range);
    }

    fn add_unaccounted_chunk_part(
        source: RcStr,
        unaccounted: u32,
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
        lines: ResolvedVc<FileLinesContent>,
    ) {
        let entry = chunk_parts
            .entry(source)
            .or_insert_with_key(|source| ChunkPart {
                source: source.clone(),
                real_size: 0,
                unaccounted_size: 0,
                ranges: vec![],
                lines,
            });
        entry.unaccounted_size += unaccounted;
    }

    fn end_current_mapping(
        source: RcStr,
        current_line: u32,
        start_column: u32,
        next_line: u32,
        next_column: u32,
        lines: &[FileLine],
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
        lines_vc: ResolvedVc<FileLinesContent>,
    ) -> State {
        let mapping_end_column = end_of_mapping_column(current_line, next_line, next_column, lines);
        let len = mapping_end_column.saturating_sub(start_column);
        add_chunk_part_range(
            source.clone(),
            ChunkPartRange {
                line: current_line,
                start_column,
                end_column: mapping_end_column,
            },
            len,
            chunk_parts,
            lines_vc,
        );
        State::AfterMapping {
            source,
            generated_line: current_line,
            current_generated_column: mapping_end_column,
        }
    }

    fn should_extend_mapping(
        state: &State,
        new_source: &RcStr,
        new_line: u32,
        new_column: u32,
    ) -> bool {
        if let State::InMapping {
            source,
            generated_line,
            end_column,
            ..
        } = state
        {
            // Extend if same source and line, and columns are adjacent or overlapping
            // end_column <= new_column handles both adjacent (equal) and overlapping cases
            source == new_source && *generated_line == new_line && *end_column <= new_column
        } else {
            false
        }
    }

    enum State {
        StartOfFile,
        InMapping {
            source: RcStr,
            generated_line: u32,
            start_column: u32,
            end_column: u32,
        },
        AfterMapping {
            source: RcStr,
            generated_line: u32,
            current_generated_column: u32,
        },
    }

    let mut state: State = State::StartOfFile;

    for token in source_map.tokens() {
        if let Token::Original(OriginalToken {
            original_file,
            generated_line,
            generated_column,
            ..
        }) = token
        {
            // Check if we can extend the current mapping
            if should_extend_mapping(&state, &original_file, generated_line, generated_column) {
                // Same source and line with adjacent columns - update end to next token position
                if let State::InMapping {
                    source,
                    generated_line: current_line,
                    start_column,
                    ..
                } = state
                {
                    state = State::InMapping {
                        source,
                        generated_line: current_line,
                        start_column,
                        end_column: generated_column,
                    };
                    continue;
                }
            }

            // End the current mapping if we're in one
            if let State::InMapping {
                source,
                generated_line: current_line,
                start_column,
                ..
            } = state
            {
                state = end_current_mapping(
                    source,
                    current_line,
                    start_column,
                    generated_line,
                    generated_column,
                    lines,
                    &mut chunk_parts,
                    lines_vc,
                );
            }

            // Start a new mapping and put the unaccounted part in between somewhere
            // Set end_column to start_column initially; it will be updated when we see the next
            // token
            match replace(
                &mut state,
                State::InMapping {
                    source: original_file.clone(),
                    generated_line,
                    start_column: generated_column,
                    end_column: generated_column,
                },
            ) {
                State::InMapping { .. } => {
                    unreachable!();
                }
                State::AfterMapping {
                    source,
                    generated_line,
                    current_generated_column,
                } => {
                    let len = len_between(
                        generated_line,
                        current_generated_column,
                        generated_line,
                        generated_column,
                        lines,
                    );
                    let half = len / 2;
                    add_unaccounted_chunk_part(source, half, &mut chunk_parts, lines_vc);
                    add_unaccounted_chunk_part(
                        original_file.clone(),
                        len - half,
                        &mut chunk_parts,
                        lines_vc,
                    );
                }
                State::StartOfFile => {
                    let len = len_between(0, 0, generated_line, generated_column, lines);
                    add_unaccounted_chunk_part(
                        original_file.clone(),
                        len,
                        &mut chunk_parts,
                        lines_vc,
                    );
                }
            }
        }
    }
    let last_line = lines.len() as u32 - 1;
    let last_column = lines[last_line as usize].len() as u32;

    // End the current token at end of file
    if let State::InMapping {
        ref source,
        generated_line,
        start_column,
        ..
    } = state
    {
        state = end_current_mapping(
            source.clone(),
            generated_line,
            start_column,
            last_line,
            last_column,
            lines,
            &mut chunk_parts,
            lines_vc,
        );
    }

    match state {
        State::InMapping { .. } => {
            unreachable!();
        }
        State::AfterMapping {
            source,
            generated_line,
            current_generated_column,
        } => {
            let len = len_between(
                generated_line,
                current_generated_column,
                last_line,
                last_column,
                lines,
            );
            add_unaccounted_chunk_part(source, len, &mut chunk_parts, lines_vc);
        }
        State::StartOfFile => {
            return unaccounted(asset, content, lines_vc).await;
        }
    }

    Ok(Vc::cell(chunk_parts.into_values().collect()))
}

async fn self_mapped(
    asset: Vc<Box<dyn OutputAsset>>,
    content: &Rope,
    lines: ResolvedVc<FileLinesContent>,
) -> Result<Vc<ChunkParts>> {
    let len = content.len().try_into().unwrap_or(u32::MAX);
    Ok(Vc::cell(vec![ChunkPart {
        source: asset.path().to_string().owned().await?,
        real_size: len,
        unaccounted_size: 0,
        ranges: vec![],
        lines,
    }]))
}

async fn unaccounted(
    asset: Vc<Box<dyn OutputAsset>>,
    content: &Rope,
    lines: ResolvedVc<FileLinesContent>,
) -> Result<Vc<ChunkParts>> {
    let len = content.len().try_into().unwrap_or(u32::MAX);
    Ok(Vc::cell(vec![ChunkPart {
        source: asset.path().to_string().owned().await?,
        real_size: 0,
        unaccounted_size: len,
        ranges: vec![],
        lines,
    }]))
}

fn append_content_between(
    start_line: u32,
    start_column: u32,
    end_line: u32,
    end_column: u32,
    lines: &[FileLine],
    out: &mut String,
) {
    let start_line = start_line.min(lines.len() as u32 - 1);
    let end_line = end_line.min(lines.len() as u32 - 1);

    let start_column = start_column.min(lines[start_line as usize].len() as u32);
    let end_column = if start_line == end_line {
        end_column.min(lines[start_line as usize].len() as u32)
    } else {
        lines[start_line as usize].len() as u32
    };

    if end_column <= start_column {
        return;
    }

    out.extend(
        lines[start_line as usize]
            .content
            .chars()
            .skip(start_column as usize)
            .take((end_column - start_column) as usize),
    );

    if start_line == end_line {
        return;
    }

    for line in &lines[start_line as usize + 1..end_line as usize] {
        out.push_str(&line.content);
    }

    out.extend(
        lines[end_line as usize]
            .content
            .chars()
            .take(end_column as usize),
    );
}
