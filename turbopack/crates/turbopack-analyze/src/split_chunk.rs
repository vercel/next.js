use std::mem::replace;

use anyhow::Result;
use bincode::{Decode, Encode};
use turbo_rcstr::RcStr;
use turbo_tasks::{FxIndexMap, NonLocalValue, ValueToString, Vc, trace::TraceRawVcs};
use turbo_tasks_fs::{FileContent, FileLine, FileLinesContent, rope::Rope};
use turbopack_core::{
    asset::{Asset, AssetContent},
    output::OutputAsset,
    source_map::{GenerateSourceMap, OriginalToken, SourceMap, SyntheticToken, Token},
};

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
    pub ranges: Vec<ChunkPartRange>,
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
    let Some(generate_source_map) =
        Vc::try_resolve_sidecast::<Box<dyn GenerateSourceMap>>(asset).await?
    else {
        return self_mapped(asset, content).await;
    };
    let source_map = generate_source_map.generate_source_map().await?;
    let Some(source_map) = source_map.as_content() else {
        return self_mapped(asset, content).await;
    };
    let Some(source_map) = SourceMap::new_from_rope(source_map.content())? else {
        return unaccounted(asset, content).await;
    };

    let lines = file_content.lines().await?;
    let FileLinesContent::Lines(lines) = &*lines else {
        return unaccounted(asset, content).await;
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
            return end_column - start_column;
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
    ) {
        let entry = chunk_parts
            .entry(source)
            .or_insert_with_key(|source| ChunkPart {
                source: source.clone(),
                real_size: 0,
                unaccounted_size: 0,
                ranges: vec![],
            });
        entry.real_size += size;
        entry.ranges.push(chunk_part_range);
    }
    fn add_unaccounted_chunk_part(
        source: RcStr,
        unaccounted: u32,
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
    ) {
        let entry = chunk_parts
            .entry(source)
            .or_insert_with_key(|source| ChunkPart {
                source: source.clone(),
                real_size: 0,
                unaccounted_size: 0,
                ranges: vec![],
            });
        entry.unaccounted_size += unaccounted;
    }

    enum State {
        StartOfFile,
        InMapping {
            source: RcStr,
            current_generated_line: u32,
            current_generated_column: u32,
        },
        AfterMapping {
            source: RcStr,
            current_generated_line: u32,
            current_generated_column: u32,
        },
    }

    let mut state: State = State::StartOfFile;

    fn end_current_token(
        lines: &[FileLine],
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
        state: &mut State,
        token: &Token,
    ) {
        if let State::InMapping {
            ref source,
            current_generated_line,
            current_generated_column,
        } = *state
        {
            let (Token::Original(OriginalToken {
                generated_line,
                generated_column,
                ..
            })
            | Token::Synthetic(SyntheticToken {
                generated_line,
                generated_column,
                ..
            })) = *token;
            let mapping_end_column = end_of_mapping_column(
                current_generated_line,
                generated_line,
                generated_column,
                lines,
            );
            // TODO: Handle this better
            let len = mapping_end_column.saturating_sub(current_generated_column);
            add_chunk_part_range(
                source.clone(),
                ChunkPartRange {
                    line: current_generated_line,
                    start_column: current_generated_column,
                    end_column: mapping_end_column,
                },
                len,
                chunk_parts,
            );
            *state = State::AfterMapping {
                source: source.clone(),
                current_generated_line,
                current_generated_column: mapping_end_column,
            };
        }
    }

    fn start_new_mapping(
        lines: &[FileLine],
        chunk_parts: &mut FxIndexMap<RcStr, ChunkPart>,
        state: &mut State,
        original_file: RcStr,
        generated_line: u32,
        generated_column: u32,
    ) {
        match replace(
            state,
            State::InMapping {
                source: original_file.clone(),
                current_generated_line: generated_line,
                current_generated_column: generated_column,
            },
        ) {
            State::InMapping { .. } => {
                unreachable!();
            }
            State::AfterMapping {
                source,
                current_generated_line,
                current_generated_column,
            } => {
                let len = len_between(
                    current_generated_line,
                    current_generated_column,
                    generated_line,
                    generated_column,
                    lines,
                );
                let half = len / 2;
                add_unaccounted_chunk_part(source, half, chunk_parts);
                add_unaccounted_chunk_part(original_file.clone(), len - half, chunk_parts);
            }
            State::StartOfFile => {
                let len = len_between(0, 0, generated_line, generated_column, lines);
                add_unaccounted_chunk_part(original_file.clone(), len, chunk_parts);
            }
        }
    }

    for token in source_map.tokens() {
        // First end the previous mapping if we were in one
        end_current_token(lines, &mut chunk_parts, &mut state, &token);

        if let Token::Original(OriginalToken {
            original_file,
            generated_line,
            generated_column,
            ..
        }) = token
        {
            // Start a new mapping and put the unaccounted part in between
            // somewhere
            start_new_mapping(
                lines,
                &mut chunk_parts,
                &mut state,
                original_file,
                generated_line,
                generated_column,
            );
        }
    }
    let last_line = lines.len() as u32 - 1;
    let last_column = lines[last_line as usize].len() as u32;
    end_current_token(
        lines,
        &mut chunk_parts,
        &mut state,
        &Token::Synthetic(SyntheticToken {
            generated_line: last_line,
            generated_column: last_column,
            guessed_original_file: None,
        }),
    );
    match state {
        State::InMapping { .. } => {
            unreachable!();
        }
        State::AfterMapping {
            source,
            current_generated_line,
            current_generated_column,
        } => {
            let len = len_between(
                current_generated_line,
                current_generated_column,
                last_line,
                last_column,
                lines,
            );
            add_unaccounted_chunk_part(source, len, &mut chunk_parts);
        }
        State::StartOfFile => {
            return unaccounted(asset, content).await;
        }
    }

    Ok(Vc::cell(chunk_parts.into_values().collect()))
}

async fn self_mapped(asset: Vc<Box<dyn OutputAsset>>, content: &Rope) -> Result<Vc<ChunkParts>> {
    let len = content.len().try_into().unwrap_or(u32::MAX);
    Ok(Vc::cell(vec![ChunkPart {
        source: asset.path().to_string().owned().await?,
        real_size: len,
        unaccounted_size: 0,
        ranges: vec![],
    }]))
}

async fn unaccounted(asset: Vc<Box<dyn OutputAsset>>, content: &Rope) -> Result<Vc<ChunkParts>> {
    let len = content.len().try_into().unwrap_or(u32::MAX);
    Ok(Vc::cell(vec![ChunkPart {
        source: asset.path().to_string().owned().await?,
        real_size: 0,
        unaccounted_size: len,
        ranges: vec![],
    }]))
}
