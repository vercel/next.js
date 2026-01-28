use std::fmt::Write;

pub fn print_markdown_table<T, const N: usize>(
    headers: [&str; N],
    data: impl IntoIterator<Item = T> + Clone,
    get_fields: impl Fn(&T) -> [String; N],
) {
    let mut sizes = headers.map(|h| h.len());
    // Measure max field size
    for item in data.clone() {
        let fields = get_fields(&item);
        for (i, field) in fields.iter().enumerate() {
            let field_size = field.len();
            if field_size > sizes[i] {
                sizes[i] = field_size;
            }
        }
    }
    // Print headers
    {
        let mut line = String::new();
        for (i, header) in headers.iter().enumerate() {
            let size = sizes[i];
            let escaped_header = escape_markdown_cell(header);
            write!(line, "| {:<width$} ", escaped_header, width = size).unwrap();
        }
        println!("{} |", line);
    }
    // Print separator
    {
        let mut line = String::new();
        for size in sizes.iter() {
            write!(line, "| {:-<width$} ", "", width = *size + 2).unwrap();
        }
        println!("{} |", line);
    }
    // Print rows
    for item in data {
        let row = get_fields(&item);
        let mut line = String::new();
        for (i, field) in row.iter().enumerate() {
            let size = sizes[i];
            let escaped_field = escape_markdown_cell(field);
            write!(line, "| {:<width$} ", escaped_field, width = size).unwrap();
        }
        println!("{} |", line);
    }
}

fn escape_markdown_cell(content: &str) -> String {
    content.replace('|', "\\|").replace('\n', " ")
}
