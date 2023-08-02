#![cfg(test)]

use sourcemap::SourceMapBuilder;
use turbo_tasks_testing::{register, run};
use turbopack_core::{
    register,
    source_map::{
        RegularSourceMap, SectionedSourceMap, SourceMap, SourceMapSection, SyntheticToken, Token,
    },
    source_pos::SourcePos,
};

register!();

#[tokio::test]
async fn sectioned_map_tokens_stop_at_next_section_when_line_exceeds_next_offset() {
    run! {
        register();

        let sectioned_map = {
            let first_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.add(2, 0, 1, 1, None, None);
                builder.into_sourcemap()
            };

            let second_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.into_sourcemap()
            };

            SectionedSourceMap::new(vec![
                SourceMapSection::new(
                    SourcePos { line: 0, column: 0 },
                    SourceMap::Regular(RegularSourceMap::new(first_map)).cell(),
                ),
                SourceMapSection::new(
                    SourcePos { line: 1, column: 0 },
                    SourceMap::Regular(RegularSourceMap::new(second_map)).cell(),
                ),
            ])
        };

        assert_eq!(sectioned_map.tokens().await?, vec![
            Token::Synthetic(SyntheticToken {
                generated_line: 0,
                generated_column: 0,
            }),
            Token::Synthetic(SyntheticToken {
                generated_line: 1,
                generated_column: 0,
            })
        ]);
    }
}

#[tokio::test]
async fn sectioned_map_tokens_stop_at_next_section_when_column_exceeds_next_offset() {
    run! {
        register();

        let sectioned_map = {
            let first_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.add(1, 2, 1, 2, None, None);
                builder.into_sourcemap()
            };

            let second_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.into_sourcemap()
            };

            SectionedSourceMap::new(vec![
                SourceMapSection::new(
                    SourcePos { line: 0, column: 0 },
                    SourceMap::Regular(RegularSourceMap::new(first_map)).cell(),
                ),
                SourceMapSection::new(
                    SourcePos { line: 1, column: 2 },
                    SourceMap::Regular(RegularSourceMap::new(second_map)).cell(),
                ),
            ])
        };

        assert_eq!(sectioned_map.tokens().await?, vec![
            Token::Synthetic(SyntheticToken {
                generated_line: 0,
                generated_column: 0,
            }),
            Token::Synthetic(SyntheticToken {
                generated_line: 1,
                generated_column: 2,
            })
        ]);
    }
}

#[tokio::test]
#[should_panic]
async fn sectioned_map_tokens_does_not_implement_nested_sections() {
    run! {
        register();

        let sectioned_map = {
            let first_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.add(1, 0, 1, 0, None, None);
                builder.into_sourcemap()
            };

            let second_map = {
                let mut builder = SourceMapBuilder::new(None);
                builder.add(0, 0, 0, 0, None, None);
                builder.into_sourcemap()
            };

            SectionedSourceMap::new(vec![
                SourceMapSection::new(
                    SourcePos { line: 0, column: 0 },
                    SourceMap::Regular(RegularSourceMap::new(first_map)).cell(),
                ),
                SourceMapSection::new(
                    SourcePos { line: 1, column: 1 },
                    SourceMap::Sectioned(SectionedSourceMap::new(vec![
                        SourceMapSection::new(
                            SourcePos { line: 0, column: 0 },
                            SourceMap::Regular(RegularSourceMap::new(second_map)).cell()
                        )
                    ])).cell(),
                ),
            ])
        };

        let _ = sectioned_map.tokens().await?;
    }
}
