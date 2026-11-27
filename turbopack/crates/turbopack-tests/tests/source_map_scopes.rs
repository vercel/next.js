#![cfg(test)]

//! Checks the ECMA-426 source map `scopes`
//! (<https://github.com/tc39/ecma426/blob/main/proposals/scopes.md>) emitted for the
//! `snapshot/source_maps/scopes` fixture.
//!
//! The `scopes` are decoded here independently of the encoder, following the proposal text, and
//! compared against the original source of the fixture. Run the snapshot tests first (with
//! `UPDATE=1`) when the expected output changes.

use std::{fs, path::Path};

use serde_json::Value;

const FIXTURE: &str = "tests/snapshot/source_maps/scopes";

#[derive(Debug)]
struct OriginalScope {
    start: (u32, u32),
    end: (u32, u32),
    name: Option<String>,
    kind: Option<String>,
    variables: Vec<String>,
    children: Vec<OriginalScope>,
}

#[derive(Debug)]
struct GeneratedRange {
    start: (u32, u32),
    end: (u32, u32),
    definition: Option<usize>,
    /// One entry per variable of the original scope; `None` if unavailable.
    bindings: Vec<Option<String>>,
    children: Vec<GeneratedRange>,
}

#[derive(Debug)]
struct Scopes {
    /// One entry per `sources` entry.
    original: Vec<Option<OriginalScope>>,
    generated: Vec<GeneratedRange>,
}

fn decode_vlqs(item: &str) -> Vec<u64> {
    const BASE64: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = vec![];
    let (mut value, mut shift) = (0u64, 0);
    for byte in item.bytes() {
        let digit = BASE64
            .iter()
            .position(|b| *b == byte)
            .unwrap_or_else(|| panic!("invalid base64 in {item:?}")) as u64;
        value |= (digit & 0b1_1111) << shift;
        shift += 5;
        if digit & 0b10_0000 == 0 {
            out.push(value);
            value = 0;
            shift = 0;
        }
    }
    assert_eq!(shift, 0, "unterminated VLQ in {item:?}");
    out
}

fn signed(value: u64) -> i64 {
    let magnitude = (value >> 1) as i64;
    if value & 1 == 1 {
        -magnitude
    } else {
        magnitude
    }
}

/// Applies a relative position: the column is relative only if the line didn't change.
fn advance(pos: &mut (u32, u32), line_delta: u64, column: u64) {
    if line_delta == 0 {
        pos.1 += column as u32;
    } else {
        pos.0 += line_delta as u32;
        pos.1 = column as u32;
    }
}

struct Decoder<'a> {
    items: Vec<&'a str>,
    idx: usize,
    names: &'a [String],
    name: i64,
    kind: i64,
    variable: i64,
    definitions: Vec<usize>,
}

impl Decoder<'_> {
    fn peek(&self) -> Option<Vec<u64>> {
        self.items
            .get(self.idx)
            .filter(|item| !item.is_empty())
            .map(|item| decode_vlqs(item))
    }

    fn next(&mut self) -> Vec<u64> {
        let item = self.peek().expect("unexpected end of scopes");
        self.idx += 1;
        item
    }

    fn name(&self, idx: i64) -> String {
        self.names[usize::try_from(idx).expect("negative name index")].clone()
    }

    fn original_scope(&mut self, pos: &mut (u32, u32)) -> OriginalScope {
        let start = self.next();
        assert_eq!(start[0], 1, "expected an original scope start");
        let flags = start[1];
        advance(pos, start[2], start[3]);
        let mut rest = start[4..].iter();
        let name = (flags & 1 != 0).then(|| {
            self.name += signed(*rest.next().unwrap());
            self.name(self.name)
        });
        let kind = (flags & 2 != 0).then(|| {
            self.kind += signed(*rest.next().unwrap());
            self.name(self.kind)
        });
        self.definitions.push(self.definitions.len());
        let mut scope = OriginalScope {
            start: *pos,
            end: (0, 0),
            name,
            kind,
            variables: vec![],
            children: vec![],
        };
        loop {
            let item = self.peek().expect("unterminated original scope");
            match item[0] {
                1 => scope.children.push(self.original_scope(pos)),
                2 => {
                    self.idx += 1;
                    advance(pos, item[1], item[2]);
                    scope.end = *pos;
                    return scope;
                }
                3 => {
                    self.idx += 1;
                    for v in &item[1..] {
                        self.variable += signed(*v);
                        scope.variables.push(self.name(self.variable));
                    }
                }
                tag => panic!("unexpected item {tag} in an original scope"),
            }
        }
    }

    fn generated_range(&mut self, pos: &mut (u32, u32), definition: &mut i64) -> GeneratedRange {
        let start = self.next();
        assert_eq!(start[0], 4, "expected a generated range start");
        let flags = start[1];
        let mut rest = start[2..].iter();
        if flags & 1 != 0 {
            pos.0 += *rest.next().unwrap() as u32;
            pos.1 = *rest.next().unwrap() as u32;
        } else {
            pos.1 += *rest.next().unwrap() as u32;
        }
        let range_definition = (flags & 2 != 0).then(|| {
            *definition += signed(*rest.next().unwrap());
            usize::try_from(*definition).expect("negative definition")
        });
        let mut range = GeneratedRange {
            start: *pos,
            end: (0, 0),
            definition: range_definition,
            bindings: vec![],
            children: vec![],
        };
        loop {
            let item = self.peek().expect("unterminated generated range");
            match item[0] {
                4 => range.children.push(self.generated_range(pos, definition)),
                5 => {
                    self.idx += 1;
                    if item.len() == 2 {
                        pos.1 += item[1] as u32;
                    } else {
                        advance(pos, item[1], item[2]);
                    }
                    range.end = *pos;
                    return range;
                }
                6 => {
                    self.idx += 1;
                    range.bindings = item[1..]
                        .iter()
                        .map(|b| (*b != 0).then(|| self.names[*b as usize - 1].clone()))
                        .collect();
                }
                tag => panic!("unexpected item {tag} in a generated range"),
            }
        }
    }
}

fn decode_scopes(map: &Value) -> Scopes {
    let names = map["names"]
        .as_array()
        .unwrap()
        .iter()
        .map(|n| n.as_str().unwrap().to_string())
        .collect::<Vec<_>>();
    let source_count = map["sources"].as_array().unwrap().len();
    let mut decoder = Decoder {
        items: map["scopes"].as_str().unwrap().split(',').collect(),
        idx: 0,
        names: &names,
        name: 0,
        kind: 0,
        variable: 0,
        definitions: vec![],
    };

    let mut original = vec![];
    while original.len() < source_count {
        match decoder.peek() {
            None if decoder.idx < decoder.items.len() => {
                decoder.idx += 1;
                original.push(None);
            }
            Some(item) if item[0] == 1 => {
                let mut pos = (0, 0);
                original.push(Some(decoder.original_scope(&mut pos)));
            }
            _ => break,
        }
    }

    let mut generated = vec![];
    let (mut pos, mut definition) = ((0, 0), 0);
    while decoder.idx < decoder.items.len() {
        generated.push(decoder.generated_range(&mut pos, &mut definition));
    }
    Scopes {
        original,
        generated,
    }
}

/// A (line, column) position, both zero-based.
type Pos = (u32, u32);

fn assert_nested(start: Pos, end: Pos, children: &[(Pos, Pos)]) {
    assert!(start <= end, "{start:?} > {end:?}");
    let mut prev = start;
    for (child_start, child_end) in children {
        assert!(*child_start >= prev, "unordered or overlapping scopes");
        assert!(*child_end <= end, "scope not contained in its parent");
        prev = *child_end;
    }
}

fn check_original(scope: &OriginalScope, lines: &[usize]) {
    for pos in [scope.start, scope.end] {
        assert!(
            (pos.1 as usize) <= lines[pos.0 as usize],
            "original position {pos:?} out of the source"
        );
    }
    let children = scope
        .children
        .iter()
        .map(|c| (c.start, c.end))
        .collect::<Vec<_>>();
    assert_nested(scope.start, scope.end, &children);
    scope.children.iter().for_each(|c| check_original(c, lines));
}

fn check_generated(range: &GeneratedRange, definitions: &[&OriginalScope]) {
    let children = range
        .children
        .iter()
        .map(|c| (c.start, c.end))
        .collect::<Vec<_>>();
    assert_nested(range.start, range.end, &children);
    if let Some(definition) = range.definition {
        let scope = definitions[definition];
        assert!(
            range.bindings.is_empty() || range.bindings.len() == scope.variables.len(),
            "bindings don't match the variables"
        );
    } else {
        assert!(range.bindings.is_empty());
    }
    range
        .children
        .iter()
        .for_each(|c| check_generated(c, definitions));
}

fn flatten<'a>(scope: &'a OriginalScope, out: &mut Vec<&'a OriginalScope>) {
    out.push(scope);
    scope.children.iter().for_each(|c| flatten(c, out));
}

/// Returns the regular map (section) of the chunk source map that maps to `source`.
fn section_for(source: &str) -> Value {
    let output = Path::new(FIXTURE).join("output");
    for entry in fs::read_dir(&output).unwrap() {
        let path = entry.unwrap().path();
        if path.extension().is_some_and(|e| e == "map") {
            let map: Value = serde_json::from_str(&fs::read_to_string(&path).unwrap()).unwrap();
            for section in map["sections"].as_array().into_iter().flatten() {
                let section = &section["map"];
                if section["sources"]
                    .as_array()
                    .is_some_and(|s| s.iter().any(|s| s.as_str().unwrap().ends_with(source)))
                {
                    return section.clone();
                }
            }
        }
    }
    panic!("no source map section for {source} in {}", output.display())
}

#[test]
fn source_map_scopes_match_original_source() {
    let map = section_for("/source_maps/scopes/input/index.js");
    let source = map["sourcesContent"][0].as_str().unwrap();
    let lines = source
        .lines()
        .map(|l| l.encode_utf16().count())
        .collect::<Vec<_>>();
    let scopes = decode_scopes(&map);

    assert_eq!(scopes.original.len(), 1);
    let module = scopes.original[0].as_ref().expect("module scope");
    check_original(module, &lines);
    let mut definitions = vec![];
    flatten(module, &mut definitions);
    assert_eq!(scopes.generated.len(), 1);
    check_generated(&scopes.generated[0], &definitions);

    assert_eq!(module.kind.as_deref(), Some("module"));
    let mut module_variables = module.variables.clone();
    module_variables.sort();
    assert_eq!(
        module_variables,
        [
            "Calculator",
            "Component",
            "arrow",
            "compute",
            "greet",
            "helper",
            "ns",
            "prefix",
            "theAnswer",
            "unusedAnswer"
        ]
    );

    // (kind, name, start, end, variables), positions taken from `input/index.js`.
    let summary = |s: &OriginalScope| {
        (
            s.kind.clone().unwrap_or_default(),
            s.name.clone().unwrap_or_default(),
            s.start,
            s.end,
            s.variables.join(","),
        )
    };
    let compute = &module.children[0];
    assert_eq!(
        summary(compute),
        (
            "function".into(),
            "compute".into(),
            (6, 0),
            (19, 1),
            "first,second,total".into()
        )
    );
    assert_eq!(
        compute.children.iter().map(summary).collect::<Vec<_>>(),
        [
            ("block".into(), "".into(), (8, 2), (15, 3), "doubled".into()),
            (
                "function".into(),
                "inner".into(),
                (16, 9),
                (18, 3),
                "extra".into()
            ),
        ]
    );
    let block = &compute.children[0];
    assert_eq!(
        block.children.iter().map(summary).collect::<Vec<_>>(),
        [
            ("block".into(), "".into(), (10, 8), (12, 5), "".into()),
            ("catch".into(), "".into(), (12, 6), (14, 5), "err".into()),
        ]
    );
    // `run(input)` and the arrow function.
    assert_eq!(
        module.children[1..]
            .iter()
            .map(|s| (s.start, s.end, s.variables.join(",")))
            .collect::<Vec<_>>(),
        [
            ((22, 2), (24, 3), "input".into()),
            ((27, 21), (27, 33), "x".into())
        ]
    );

    // The module range binds the imports to the expressions used in the generated code.
    let module_range = &scopes.generated[0];
    assert_eq!(module_range.definition, Some(0));
    let binding = |name: &str| {
        let idx = module.variables.iter().position(|v| v == name).unwrap();
        module_range.bindings[idx].clone()
    };
    let namespace = "__TURBOPACK__imported__module__$5b$project$5d2f$turbopack$2f$crates$2f$\
                     turbopack$2d$tests$2f$tests$2f$snapshot$2f$source_maps$2f$scopes$2f$input$\
                     2f$dep$2e$js__$5b$test$5d$__$28$ecmascript$29$__";
    assert_eq!(binding("helper"), Some(format!("{namespace}[\"helper\"]")));
    assert_eq!(
        binding("theAnswer"),
        Some(format!("{namespace}[\"answer\"]"))
    );
    assert_eq!(binding("greet"), Some(format!("{namespace}[\"default\"]")));
    assert_eq!(binding("ns"), Some(namespace.to_string()));
    assert_eq!(
        binding("unusedAnswer"),
        None,
        "unused imports are unavailable"
    );
    assert_eq!(binding("prefix").as_deref(), Some("prefix"));

    // Every available import binding is an expression that occurs in the generated code.
    let code = fs::read_dir(Path::new(FIXTURE).join("output"))
        .unwrap()
        .map(|e| e.unwrap().path())
        .filter(|p| p.extension().is_some_and(|e| e == "js"))
        .map(|p| fs::read_to_string(p).unwrap())
        .collect::<String>();
    for name in ["helper", "theAnswer", "greet", "ns"] {
        assert!(code.contains(&binding(name).unwrap()), "{name}");
    }
}

#[test]
fn source_map_scopes_omit_imports_injected_by_transforms() {
    let map = section_for("/source_maps/scopes/input/component.jsx");
    let scopes = decode_scopes(&map);
    let module = scopes.original[0].as_ref().expect("module scope");
    // The JSX runtime import is injected by the JSX transform and doesn't exist in the source.
    assert_eq!(module.variables, ["helper", "Component"]);
    assert_eq!(
        module.children[0].variables,
        ["value"],
        "destructured parameter"
    );
}

#[test]
fn source_map_scopes_are_omitted_for_minified_and_merged_output() {
    for fixture in ["scopes-minified", "scopes-merged"] {
        let output = Path::new(FIXTURE).with_file_name(fixture).join("output");
        for entry in fs::read_dir(&output).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|e| e == "map") {
                let map = fs::read_to_string(&path).unwrap();
                assert!(!map.contains("\"scopes\""), "{}", path.display());
            }
        }
    }
}
