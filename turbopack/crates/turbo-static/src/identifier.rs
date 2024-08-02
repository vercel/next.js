use std::{fs, path::PathBuf};

use lsp_types::{CallHierarchyIncomingCall, CallHierarchyItem, Range};

/// A task that references another, with the range of the reference
#[derive(Hash, PartialEq, Eq, serde::Deserialize, serde::Serialize, Clone, Debug)]
pub struct IdentifierReference {
    pub identifier: Identifier,
    pub references: Vec<Range>, // the places where this identifier is used
}

/// identifies a task by its file, and range in the file
#[derive(Hash, PartialEq, Eq, serde::Deserialize, serde::Serialize, Clone)]
pub struct Identifier {
    pub path: String,
    // technically you can derive this from the name and range but it's easier to just store it
    pub name: String,
    // post_transform_name: Option<String>,
    pub range: lsp_types::Range,
}

impl Identifier {
    /// check the span matches and the text matches
    ///
    /// `same_location` is used to check if the location of the identifier is
    /// the same as the other
    pub fn equals_ident(&self, other: &syn::Ident, match_location: bool) -> bool {
        *other == self.name
            && (!match_location
                || (self.range.start.line == other.span().start().line as u32
                    && self.range.start.character == other.span().start().column as u32))
    }

    /// We cannot use `item.name` here in all cases as, during testing, the name
    /// does not always align with the exact text in the range.
    fn get_name(item: &CallHierarchyItem) -> String {
        // open file, find range inside, extract text
        let file = fs::read_to_string(item.uri.path()).unwrap();
        let start = item.selection_range.start;
        let end = item.selection_range.end;
        file.lines()
            .nth(start.line as usize)
            .unwrap()
            .chars()
            .skip(start.character as usize)
            .take(end.character as usize - start.character as usize)
            .collect()
    }
}

impl From<(PathBuf, syn::Ident)> for Identifier {
    fn from((path, ident): (PathBuf, syn::Ident)) -> Self {
        Self {
            path: path.display().to_string(),
            name: ident.to_string(),
            // post_transform_name: None,
            range: Range {
                start: lsp_types::Position {
                    line: ident.span().start().line as u32 - 1,
                    character: ident.span().start().column as u32,
                },
                end: lsp_types::Position {
                    line: ident.span().end().line as u32 - 1,
                    character: ident.span().end().column as u32,
                },
            },
        }
    }
}

impl From<CallHierarchyIncomingCall> for IdentifierReference {
    fn from(item: CallHierarchyIncomingCall) -> Self {
        Self {
            identifier: Identifier {
                name: Identifier::get_name(&item.from),
                // post_transform_name: Some(item.from.name),
                path: item.from.uri.path().to_owned(),
                range: item.from.selection_range,
            },
            references: item.from_ranges,
        }
    }
}

impl std::fmt::Debug for Identifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        std::fmt::Display::fmt(self, f)
    }
}

impl std::fmt::Display for Identifier {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}:{}#{}", self.path, self.range.start.line, self.name,)
    }
}
