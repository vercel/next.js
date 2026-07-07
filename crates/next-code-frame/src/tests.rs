use insta::assert_snapshot;

use crate::{
    CodeFrameColorMode, CodeFrameLocation, CodeFrameOptions, Location,
    highlight::tests::strip_ansi_codes, render_code_frame,
};

/// Helper function to render code frame with highlighting enabled and ANSI codes stripped.
/// This ensures highlighting doesn't break the basic formatting.
/// Returns `None` when the code frame cannot be produced (e.g., out-of-range location).
fn render_for_snapshot(
    source: &str,
    location: &CodeFrameLocation,
    options: &CodeFrameOptions,
) -> Result<Option<String>, anyhow::Error> {
    let mut opts_with_highlighting = options.clone();
    opts_with_highlighting.highlight_code = true;

    let result = render_code_frame(source, location, &opts_with_highlighting)?;
    Ok(result.map(|s| strip_ansi_codes(&s)))
}

#[test]
fn test_simple_single_line_error() {
    let source = "console.log('hello')";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | console.log('hello')
        | ^
    ");
}

#[test]
fn test_empty_source() {
    let source = "";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options).unwrap();
    assert!(result.is_none(), "empty source should return None");
}

#[test]
fn test_invalid_line_number() {
    let source = "line 1\nline 2";
    let location = CodeFrameLocation {
        start: Location {
            line: 100,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options).unwrap();
    assert!(
        result.is_none(),
        "out-of-range line number should return None"
    );
}

#[test]
fn test_zero_start_column() {
    let source = "hello world";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(0),
        },
        end: None,
    };
    let options = CodeFrameOptions::default();

    let result = render_code_frame(source, &location, &options);
    assert!(result.is_err(), "column 0 should be an error");
}

#[test]
fn test_zero_end_column() {
    let source = "hello world";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(1),
        },
        end: Some(Location {
            line: 1,
            column: Some(0),
        }),
    };
    let options = CodeFrameOptions::default();

    let result = render_code_frame(source, &location, &options);
    assert!(result.is_err(), "end column 0 should be an error");
}

#[test]
fn test_multiline_error() {
    let source = "function test() {\n  console.log('hello')\n  return 42\n}";
    let location = CodeFrameLocation {
        start: Location {
            line: 2,
            column: Some(3),
        },
        end: Some(Location {
            line: 3,
            column: Some(12),
        }),
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      1 | function test() {
    > 2 |   console.log('hello')
        |   ^^^^^^^^^^^^^^^^^^^
    > 3 |   return 42
        | ^^^^^^^^^^^
      4 | }
    ");
}

#[test]
fn test_multiline_error_with_message() {
    let source = "function test() {\n  console.log('hello')\n  return 42\n}";
    let location = CodeFrameLocation {
        start: Location {
            line: 2,
            column: Some(3),
        },
        end: Some(Location {
            line: 3,
            column: Some(12),
        }),
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        message: Some("Unexpected expression".to_string()),
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      1 | function test() {
    > 2 |   console.log('hello')
        |   ^^^^^^^^^^^^^^^^^^^
    > 3 |   return 42
        | ^^^^^^^^^^^ Unexpected expression
      4 | }
    ");
}

#[test]
fn test_with_message() {
    let source = "const x = 1";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(7),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        message: Some("Expected semicolon".to_string()),
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const x = 1
        |       ^ Expected semicolon
    ");
}

#[test]
fn test_long_line_single_error() {
    // Create a very long line with error in the middle
    let mut long_line = "a".repeat(500);
    long_line.replace_range(249..250, "x"); // Mark error location (column 250)
    let source = format!("short\n{}\nshort", long_line);

    let location = CodeFrameLocation {
        start: Location {
            line: 2,
            column: Some(250),
        }, // Error in the middle of the long line
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 100,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      1 | ...
    > 2 | ...aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaxaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...
        |                                                ^
      3 | ...
    ");
}

#[test]
fn test_long_line_at_start() {
    // Error at the beginning of a long line
    let mut long_line = "a".repeat(500);
    long_line.replace_range(4..5, "x"); // Mark error location (column 5)
    let source = long_line.clone();

    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(5),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 100,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | aaaaxaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...
        |     ^
    ");
}

#[test]
fn test_long_line_at_end() {
    // Error at the end of a long line
    let mut long_line = "a".repeat(500);
    long_line.replace_range(494..495, "x"); // Insert 'x' at error location (column 495)
    let source = long_line.clone();

    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(495),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 100,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | ...aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaxaaaaa
        |                                                ^
    ");
}

#[test]
fn test_long_line_multiline_aligned() {
    // Multiple long lines should all be truncated at the same offset
    let long_line1 = "b".repeat(500);
    let mut long_line2 = "c".repeat(500);
    long_line2.replace_range(249..250, "x"); // Mark error location (column 250)
    let long_line3 = "d".repeat(500);
    let source = format!("{}\n{}\n{}", long_line1, long_line2, long_line3);

    let location = CodeFrameLocation {
        start: Location {
            line: 2,
            column: Some(250),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 100,
        lines_above: 1,
        lines_below: 1,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      1 | ...bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb...
    > 2 | ...ccccccccccccccccccccccccccccccccccccccccccccxccccccccccccccccccccccccccccccccccccccccccc...
        |                                                ^
      3 | ...dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd...
    ");
}

#[test]
fn test_context_lines() {
    let source = "line 1\nline 2\nline 3\nline 4\nline 5\nline 6\nline 7";
    let location = CodeFrameLocation {
        start: Location {
            line: 4,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        lines_above: 2,
        lines_below: 2,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      2 | line 2
      3 | line 3
    > 4 | line 4
        | ^
      5 | line 5
      6 | line 6
    ");
}

#[test]
fn test_gutter_width_alignment() {
    let source = (1..=100)
        .map(|i| format!("line {}", i))
        .collect::<Vec<_>>()
        .join("\n");
    let location = CodeFrameLocation {
        start: Location {
            line: 99,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        lines_above: 2,
        lines_below: 1,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
       97 | line 97
       98 | line 98
    >  99 | line 99
          | ^
      100 | line 100
    ");
}

#[test]
fn test_large_file() {
    // Test with a multi-megabyte file
    let line = "x".repeat(100);
    let mut lines: Vec<String> = (1..=50000)
        .map(|i| format!("line {} {}", i, line))
        .collect();
    // Mark the error line so the `^` visibly points at something distinct
    lines[24999] = format!("ERROR on line 25000 {}", line);
    let source = lines.join("\n");

    let location = CodeFrameLocation {
        start: Location {
            line: 25000,
            column: Some(1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        lines_above: 2,
        lines_below: 2,
        max_width: 140,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      24998 | line 24998 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      24999 | line 24999 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    > 25000 | ERROR on line 25000 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            | ^
      25001 | line 25001 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
      25002 | line 25002 xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
    ");
}

#[test]
fn test_long_error_span() {
    // Test error span that is longer than available width
    let long_line = "a".repeat(500);
    let source = long_line.clone();

    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(100),
        },
        end: Some(Location {
            line: 1,
            column: Some(400),
        }), // 300 char span
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 100,
        ..Default::default()
    };

    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | ...aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa...
        |    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
    ");
}

#[test]
fn test_markdown_file() {
    // Markdown file should not crash (no syntax highlighting)
    let source = r#"# Title

This is a paragraph with some **bold** text.

```javascript
const x = 1;
```

Another paragraph.
"#;

    let location = CodeFrameLocation {
        start: Location {
            line: 3,
            column: Some(25),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
      1 | # Title
      2 |
    > 3 | This is a paragraph with some **bold** text.
        |                         ^
      4 |
      5 | ```javascript
      6 | const x = 1;
    ");
}

#[test]
fn test_invalid_column_start_out_of_bounds() {
    // Start column beyond line length should be clamped
    let source = "short";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(100),
        }, // Way past end of line
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | short
        |      ^
    ");
}

#[test]
fn test_invalid_column_end_before_start() {
    // End column before start column should show single marker at start
    let source = "const x = 123;";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(11),
        }, // "123"
        end: Some(Location {
            line: 1,
            column: Some(5),
        }), // Before start - invalid
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const x = 123;
        |           ^
    ");
}

#[test]
fn test_invalid_column_both_out_of_bounds() {
    // Both columns out of bounds
    let source = "abc";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(10),
        },
        end: Some(Location {
            line: 1,
            column: Some(20),
        }),
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | abc
        |    ^
    ");
}

#[test]
fn test_invalid_multiline_end_column_out_of_bounds() {
    // Multiline error with end column out of bounds on last line
    let source = "line1\nshort\nline3";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(2),
        },
        end: Some(Location {
            line: 2,
            column: Some(50),
        }), // Way past end of "short"
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | line1
        |  ^^^
    > 2 | short
        | ^^^^^^
      3 | line3
    ");
}

#[test]
fn test_column_semantics_explicit_end() {
    // Test to clarify: is end_column inclusive or exclusive?
    let source = "const x = 123;";

    // Test 1: Mark just the first digit "1" at column 11 (1-indexed)
    // With EXCLUSIVE semantics: end_column should be 12 to mark column 11
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(11),
        },
        end: Some(Location {
            line: 1,
            column: Some(12),
        }), // Exclusive: marks [11, 12) = column 11 only
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const x = 123;
        |           ^
    ");

    // Test 2: Mark "123" which spans columns 11-13 (1-indexed)
    // With EXCLUSIVE semantics: end_column should be 14 to mark columns 11-13
    let location2 = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(11),
        },
        end: Some(Location {
            line: 1,
            column: Some(14),
        }), // Exclusive: marks [11, 14) = columns 11, 12, 13
    };

    let result = render_for_snapshot(source, &location2, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const x = 123;
        |           ^^^
    ");
}

#[test]
fn test_highlighting_doesnt_break_formatting() {
    // Verify highlighting invariant: stripping ANSI from highlighted output must match plain.
    // Tests both ASCII and multi-byte (CJK) sources to ensure byte-based SWC token
    // boundaries align correctly with char boundaries.
    fn assert_highlighting_roundtrips(source: &str, location: &CodeFrameLocation) {
        let options_plain = CodeFrameOptions {
            highlight_code: false,
            ..Default::default()
        };
        let result_plain = render_code_frame(source, location, &options_plain)
            .unwrap()
            .unwrap();

        // highlight_code=true with color=false should be identical to plain
        let options_highlighted = CodeFrameOptions {
            highlight_code: true,
            ..Default::default()
        };
        let result_highlighted = render_code_frame(source, location, &options_highlighted)
            .unwrap()
            .unwrap();
        assert_eq!(
            result_plain, result_highlighted,
            "Highlighting with color=false should produce identical output"
        );

        // color with ANSI stripped should also match plain
        let options_colored = CodeFrameOptions {
            color: CodeFrameColorMode::Error,
            highlight_code: true,
            ..Default::default()
        };
        let result_colored = render_code_frame(source, location, &options_colored)
            .unwrap()
            .unwrap();
        assert_eq!(
            result_plain,
            strip_ansi_codes(&result_colored),
            "Highlighted output with ANSI codes stripped should match plain output"
        );
    }

    // ASCII source
    assert_highlighting_roundtrips(
        "const foo = 'bar';",
        &CodeFrameLocation {
            start: Location {
                line: 1,
                column: Some(7),
            },
            end: Some(Location {
                line: 1,
                column: Some(10),
            }),
        },
    );

    // Multi-byte (CJK) source — exercises byte-based token boundary alignment
    assert_highlighting_roundtrips(
        "const 名前 = 'こんにちは';",
        &CodeFrameLocation {
            start: Location {
                line: 1,
                column: Some(1),
            },
            end: None,
        },
    );
}

// =============================================================================
// Multi-byte character tests
// =============================================================================

#[test]
fn test_multibyte_cjk_no_truncation() {
    // CJK characters: each is 3 bytes in UTF-8
    // "const 変数 = '値';" has column positions that differ in byte vs char space
    let source = "const 変数 = '値';";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(7),
        }, // byte offset of '変'
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const 変数 = '値';
        |       ^
    ");
}

#[test]
fn test_multibyte_cjk_with_truncation() {
    // Long line with CJK characters forcing truncation.
    // Each CJK char is 3 bytes. "あ".repeat(200) = 200 chars, 600 bytes.
    // Error in the middle — this is the scenario that would panic without char-boundary snapping.
    let cjk_line = "あ".repeat(200);
    let source = format!("short\n{}\nshort", cjk_line);

    let location = CodeFrameLocation {
        start: Location {
            line: 2,
            // Byte offset pointing to the 100th character (byte 297 = 99*3)
            column: Some(99 * 3 + 1),
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 80,
        ..Default::default()
    };

    // This must not panic — the truncation offset must snap to a char boundary
    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    // Just verify it produces output and contains the CJK chars
    assert!(!result.is_empty(), "Should produce non-empty output");
    assert!(result.contains("あ"), "Should contain CJK characters");
    assert!(result.contains("^"), "Should contain marker");
}

#[test]
fn test_multibyte_emoji() {
    // Emoji: '😀' is 4 bytes in UTF-8
    let source = "const x = '😀😀😀';";
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(12), // byte offset of first emoji within the string
        },
        end: Some(Location {
            line: 1,
            column: Some(24), // exclusive end, 3 emojis * 4 bytes = 12 bytes
        }),
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        ..Default::default()
    };

    let result = render_for_snapshot(source, &location, &options)
        .unwrap()
        .unwrap();
    assert_snapshot!(result, @r"
    > 1 | const x = '😀😀😀';
        |            ^^^^^^
    ");
}

#[test]
fn test_multibyte_mixed_with_truncation() {
    // Mix of ASCII and CJK with a long line forcing truncation.
    // The truncation offset may land between an ASCII and CJK boundary.
    let ascii_prefix = "a".repeat(100);
    let cjk_section = "漢字".repeat(50); // 100 CJK chars, 300 bytes
    let ascii_suffix = "z".repeat(100);
    let source = format!("{}{}{}", ascii_prefix, cjk_section, ascii_suffix);

    // Error in the CJK section
    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(150), // somewhere in the CJK section (byte offset)
        },
        end: None,
    };
    let options = CodeFrameOptions {
        highlight_code: false,
        max_width: 80,
        ..Default::default()
    };

    // Must not panic
    let result = render_for_snapshot(&source, &location, &options)
        .unwrap()
        .unwrap();
    assert!(!result.is_empty(), "Should produce non-empty output");
    assert!(result.contains("^"), "Should contain marker");
}

#[test]
fn test_multibyte_cjk_truncation_with_highlighting() {
    // The most challenging scenario: truncation + highlighting + multi-byte chars.
    // SWC highlight markers are byte-based, truncation offset is byte-based,
    // and the char boundary snapping must keep them consistent.
    let cjk_line = "あ".repeat(200);
    let source = format!("const x = '{}';", cjk_line);

    let location = CodeFrameLocation {
        start: Location {
            line: 1,
            column: Some(12), // byte offset of first 'あ' in the string literal
        },
        end: None,
    };
    let options = CodeFrameOptions {
        color: CodeFrameColorMode::Error,
        highlight_code: true,
        max_width: 80,
        ..Default::default()
    };

    // Must not panic — exercises truncation + highlighting with multi-byte
    let result = render_code_frame(&source, &location, &options)
        .unwrap()
        .unwrap();

    // Strip ANSI and verify the plain text is reasonable
    let stripped = strip_ansi_codes(&result);
    assert!(stripped.contains("あ"), "Should contain CJK characters");
    assert!(stripped.contains("^"), "Should contain marker");
}
