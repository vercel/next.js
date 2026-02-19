use std::fmt::Write;

/// Prints a markdown table to stdout.
/// See `write_markdown_table` for details.
#[allow(dead_code)]
pub fn print_markdown_table<T, const N: usize>(
    headers: [&str; N],
    data: impl IntoIterator<Item = T> + Clone,
    get_fields: impl Fn(&T) -> [String; N],
) {
    write_markdown_table(&mut std::io::stdout(), headers, data, get_fields);
}

/// Writes a markdown table to the given writer.
/// The headers and fields can specify alignment by starting or ending with a space:
///   - " Text" - right aligned
///   - " Text " - center aligned
///   - "Text" - left aligned
///
/// Also, if multiple consecutive headers are identical, they will be form a merged header cell.
#[allow(dead_code)]
pub fn write_markdown_table<T, const N: usize>(
    write: &mut impl std::io::Write,
    headers: [&str; N],
    data: impl IntoIterator<Item = T> + Clone,
    get_fields: impl Fn(&T) -> [String; N],
) {
    let mut merged = headers.map(|_| false);
    for i in 1..N {
        if headers[i].trim() == headers[i - 1].trim() {
            merged[i] = true;
        }
    }
    // Measure max field size
    let mut sizes = headers.map(|_| 1);
    for item in data.clone() {
        let fields = get_fields(&item);
        for (i, field) in fields.iter().enumerate() {
            let field_size = field.trim().len();
            if field_size > sizes[i] {
                sizes[i] = field_size;
            }
        }
    }
    // Add header size
    let mut headers_sizes = sizes;
    for (i, header) in headers.iter().enumerate() {
        if merged[i] {
            headers_sizes[i] = 0;
            continue;
        }
        let header_size = header.trim().len();
        let current_size = sizes[i]
            + (i + 1..N)
                .take_while(|&j| merged[j])
                .map(|j| sizes[j] + 1)
                .sum::<usize>();
        if header_size > current_size {
            sizes[i] += header_size - current_size;
            headers_sizes[i] = header_size;
        } else {
            headers_sizes[i] = current_size;
        }
    }
    // Print headers
    {
        let mut line = String::new();
        for (i, header) in headers.iter().enumerate() {
            let size = headers_sizes[i];
            if size == 0 {
                continue;
            }
            let right = header.starts_with(' ');
            let center = header.ends_with(' ') && right;
            let escaped_header = escape_markdown_cell(header.trim());
            if center {
                write!(line, "| {:^width$} ", escaped_header, width = size).unwrap();
            } else if right {
                write!(line, "| {:>width$} ", escaped_header, width = size).unwrap();
            } else {
                write!(line, "| {:<width$} ", escaped_header, width = size).unwrap();
            }
        }
        writeln!(write, "{}|", line).unwrap();
    }
    // Print separator
    {
        let mut line = String::new();
        for size in headers_sizes.iter() {
            if *size == 0 {
                continue;
            }
            write!(line, "| {:-<width$} ", "", width = *size).unwrap();
        }
        writeln!(write, "{}|", line).unwrap();
    }
    // Print rows
    for item in data {
        let row = get_fields(&item);
        let mut line = String::new();
        for (i, field) in row.iter().enumerate() {
            let size = sizes[i];
            let right = field.starts_with(' ');
            let center = field.ends_with(' ') && right;
            let escaped_field = escape_markdown_cell(field.trim());
            let separator = if merged[i] { "" } else { "| " };
            if center {
                write!(line, "{separator}{:^width$} ", escaped_field, width = size).unwrap();
            } else if right {
                write!(line, "{separator}{:>width$} ", escaped_field, width = size).unwrap();
            } else {
                write!(line, "{separator}{:<width$} ", escaped_field, width = size).unwrap();
            }
        }
        writeln!(write, "{}|", line).unwrap();
    }
}

#[allow(dead_code)]
fn escape_markdown_cell(content: &str) -> String {
    content.replace('|', "\\|").replace('\n', " ")
}

#[cfg(test)]
mod tests {
    use super::write_markdown_table;

    #[test]
    fn test_write_markdown_table() {
        let headers = [" Name ", " Age", " Birthday (Age)", " Birthday (Age)"];
        let data = vec![
            (" Alice ", " 30", " 1990-01-01", "(30)"),
            (" Bob ", " 25", " 2024", "(9)"),
            (" Charlie ", " 35", " 1985-08-20", "(35)"),
            (" N/A ", " ?", " N/A", "(?)"),
        ];
        let mut output = Vec::new();
        write_markdown_table(&mut output, headers, data, |item| {
            [
                item.0.to_string(),
                item.1.to_string(),
                item.2.to_string(),
                item.3.to_string(),
            ]
        });
        let output = String::from_utf8(output).unwrap();
        let expected = r#"
|  Name   | Age |  Birthday (Age) |
| ------- | --- | --------------- |
|  Alice  |  30 | 1990-01-01 (30) |
|   Bob   |  25 |       2024 (9)  |
| Charlie |  35 | 1985-08-20 (35) |
|   N/A   |   ? |        N/A (?)  |
"#;
        assert_eq!(
            output.trim().lines().collect::<Vec<_>>(),
            expected.trim().lines().collect::<Vec<_>>()
        );
    }
}
