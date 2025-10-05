use std::{env, str::from_utf8, sync::Arc};

use anyhow::{Context, Result, bail};
use indexmap::map::Entry;
use rustc_demangle::demangle;
use rustc_hash::{FxHashMap, FxHashSet};

use super::TraceFormat;
use crate::{FxIndexMap, span::SpanIndex, store_container::StoreContainer, timestamp::Timestamp};

#[derive(Debug, Clone, Copy)]
struct TraceNode {
    ip_index: usize,
    parent_index: usize,
}

impl TraceNode {
    pub fn read(s: &mut &[u8]) -> Result<Self> {
        Ok(Self {
            ip_index: read_hex_index(s)?,
            parent_index: read_hex_index(s)?,
        })
    }
}

#[derive(Debug, Hash, PartialEq, Eq)]
struct InstructionPointer {
    module_index: usize,
    frames: Vec<Frame>,
    custom_name: Option<String>,
}

impl InstructionPointer {
    pub fn read(s: &mut &[u8]) -> Result<Self> {
        let _ip = read_hex(s)?;
        Ok(Self {
            module_index: read_hex_index(s)?,
            frames: read_all(s, Frame::read)?,
            custom_name: None,
        })
    }
}

#[derive(Debug, Hash, PartialEq, Eq)]
struct Frame {
    function_index: usize,
    file_index: usize,
    line: u64,
}

impl Frame {
    pub fn read(s: &mut &[u8]) -> Result<Self> {
        Ok(Self {
            function_index: read_hex_index(s)?,
            file_index: read_hex_index(s)?,
            line: read_hex(s)?,
        })
    }
}

#[derive(Debug)]
struct AllocationInfo {
    size: u64,
    trace_index: usize,
}

impl AllocationInfo {
    pub fn read(s: &mut &[u8]) -> Result<Self> {
        Ok(Self {
            size: read_hex(s)?,
            trace_index: read_hex_index(s)?,
        })
    }
}

struct InstructionPointerExtraInfo {
    first_trace_of_ip: Option<usize>,
}

#[derive(Clone, Copy)]
struct TraceData {
    span_index: SpanIndex,
    ip_index: usize,
    parent_trace_index: usize,
}

pub struct HeaptrackFormat {
    store: Arc<StoreContainer>,
    version: u32,
    last_timestamp: Timestamp,
    strings: Vec<String>,
    traces: Vec<TraceData>,
    ip_parent_map: FxHashMap<(usize, SpanIndex), usize>,
    trace_instruction_pointers: Vec<usize>,
    instruction_pointers: FxIndexMap<InstructionPointer, InstructionPointerExtraInfo>,
    allocations: Vec<AllocationInfo>,
    spans: usize,
    collapse_crates: FxHashSet<String>,
    expand_crates: FxHashSet<String>,
    expand_recursion: bool,
    allocated_memory: u64,
    temp_allocated_memory: u64,
}

const RECURSION_IP: usize = 1;

impl HeaptrackFormat {
    pub fn new(store: Arc<StoreContainer>) -> Self {
        Self {
            store,
            version: 0,
            last_timestamp: Timestamp::ZERO,
            strings: vec!["".to_string()],
            traces: vec![TraceData {
                span_index: SpanIndex::new(usize::MAX).unwrap(),
                ip_index: 0,
                parent_trace_index: 0,
            }],
            ip_parent_map: FxHashMap::default(),
            instruction_pointers: {
                let mut map = FxIndexMap::with_capacity_and_hasher(2, Default::default());
                map.insert(
                    InstructionPointer {
                        module_index: 0,
                        frames: Vec::new(),
                        custom_name: Some("root".to_string()),
                    },
                    InstructionPointerExtraInfo {
                        first_trace_of_ip: None,
                    },
                );
                map.insert(
                    InstructionPointer {
                        module_index: 0,
                        frames: Vec::new(),
                        custom_name: Some("recursion".to_string()),
                    },
                    InstructionPointerExtraInfo {
                        first_trace_of_ip: None,
                    },
                );
                map
            },
            trace_instruction_pointers: vec![0],
            allocations: vec![],
            spans: 0,
            collapse_crates: env::var("COLLAPSE_CRATES")
                .unwrap_or_default()
                .split(',')
                .map(|s| s.to_string())
                .collect(),
            expand_crates: env::var("EXPAND_CRATES")
                .unwrap_or_default()
                .split(',')
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .collect(),
            expand_recursion: env::var("EXPAND_RECURSION").is_ok(),
            allocated_memory: 0,
            temp_allocated_memory: 0,
        }
    }
}

impl TraceFormat for HeaptrackFormat {
    fn stats(&self) -> String {
        format!(
            "{} spans, {} strings, {} ips, {} traces, {} allocations, {:.2} GB allocated, {:.2} \
             GB temporarily allocated",
            self.spans,
            self.strings.len() - 1,
            self.trace_instruction_pointers.len() - 1,
            self.traces.len() - 1,
            self.allocations.len() - 1,
            (self.allocated_memory / 1024 / 1024) as f32 / 1024.0,
            (self.temp_allocated_memory / 1024 / 1024) as f32 / 1024.0,
        )
    }

    type Reused = ();

    fn read(&mut self, mut buffer: &[u8], _reuse: &mut Self::Reused) -> anyhow::Result<usize> {
        let mut bytes_read = 0;
        let mut outdated_spans = FxHashSet::default();
        let mut store = self.store.write();
        'outer: loop {
            let Some(line_end) = buffer.iter().position(|b| *b == b'\n') else {
                break;
            };
            let full_line = &buffer[..line_end];
            buffer = &buffer[line_end + 1..];
            bytes_read += full_line.len() + 1;

            if full_line.is_empty() {
                continue;
            }
            let ty = full_line[0];
            let mut line = &full_line[2..];

            // For format see https://github.com/KDE/heaptrack/blob/b000a73e0bf0a275ec41eef0fe34701a0942cdd8/src/analyze/accumulatedtracedata.cpp#L151
            match ty {
                b'v' => {
                    let _ = read_hex(&mut line)?;
                    self.version = read_hex(&mut line)? as u32;
                    if self.version != 2 && self.version != 3 {
                        bail!("Unsupported version: {} (expected 2 or 3)", self.version);
                    }
                }
                b's' => {
                    let string = if self.version == 2 {
                        String::from_utf8(line.to_vec())?
                    } else {
                        read_sized_string(&mut line)?
                    };
                    self.strings.push(demangle(&string).to_string());
                }
                b't' => {
                    let TraceNode {
                        ip_index,
                        parent_index,
                    } = TraceNode::read(&mut line)?;
                    let ip_index = *self
                        .trace_instruction_pointers
                        .get(ip_index)
                        .context("ip not found")?;
                    let (ip, ip_info) = self
                        .instruction_pointers
                        .get_index(ip_index)
                        .context("ip not found")?;
                    // Try to fix cut-off traces
                    if parent_index == 0
                        && let Some(trace_index) = ip_info.first_trace_of_ip
                    {
                        let trace = self.traces.get(trace_index).context("trace not found")?;
                        self.traces.push(*trace);
                        continue;
                    }
                    // Lookup parent
                    let parent = if parent_index > 0 {
                        let parent = *self.traces.get(parent_index).context("parent not found")?;
                        // Check if we have an duplicate (can only happen due to cut-off traces)
                        if let Some(trace_index) =
                            self.ip_parent_map.get(&(ip_index, parent.span_index))
                        {
                            let trace = self.traces.get(*trace_index).context("trace not found")?;
                            self.traces.push(*trace);
                            continue;
                        }
                        // Check if we repeat parent frame
                        if parent.ip_index == ip_index {
                            self.traces.push(parent);
                            continue;
                        }
                        if !self.expand_recursion {
                            // Check for recursion
                            let mut current = parent.parent_trace_index;
                            while current > 0 {
                                let current_parent =
                                    self.traces.get(current).context("parent not found")?;
                                current = current_parent.parent_trace_index;
                                if current_parent.ip_index == ip_index {
                                    if parent.ip_index == RECURSION_IP {
                                        // Parent is recursion node, do nothing
                                        self.traces.push(parent);
                                    } else if let Some(trace_index) =
                                        self.ip_parent_map.get(&(RECURSION_IP, parent.span_index))
                                    {
                                        // There is already one recursion node, reuse it
                                        let trace = self
                                            .traces
                                            .get(*trace_index)
                                            .context("trace not found")?;
                                        self.traces.push(*trace);
                                    } else {
                                        // create a new recursion node
                                        let span_index = store.add_span(
                                            Some(parent.span_index),
                                            self.last_timestamp,
                                            "".to_string(),
                                            "recursion".to_string(),
                                            Vec::new(),
                                            &mut outdated_spans,
                                        );
                                        store.complete_span(span_index);
                                        let index = self.traces.len();
                                        self.traces.push(TraceData {
                                            ip_index: RECURSION_IP,
                                            parent_trace_index: parent_index,
                                            span_index,
                                        });
                                        self.ip_parent_map
                                            .insert((RECURSION_IP, parent.span_index), index);
                                    }
                                    continue 'outer;
                                }
                            }
                        }
                        Some(parent.span_index)
                    } else {
                        None
                    };
                    let InstructionPointer {
                        module_index,
                        frames,
                        custom_name,
                    } = ip;
                    let module = self
                        .strings
                        .get(*module_index)
                        .context("module not found")?;
                    let name = if let Some(name) = custom_name.as_ref() {
                        name.to_string()
                    } else if let Some(first_frame) = frames.first() {
                        let file = self
                            .strings
                            .get(first_frame.file_index)
                            .context("file not found")?;
                        let function = self
                            .strings
                            .get(first_frame.function_index)
                            .context("function not found")?;
                        format!("{} @ {file}:{}", function, first_frame.line)
                    } else {
                        "unknown".to_string()
                    };
                    let mut args = Vec::new();
                    for Frame {
                        function_index,
                        file_index,
                        line,
                    } in frames.iter()
                    {
                        let file = self.strings.get(*file_index).context("file not found")?;
                        let function = self
                            .strings
                            .get(*function_index)
                            .context("function not found")?;
                        args.push((
                            "location".to_string(),
                            format!("{function} @ {file}:{line}"),
                        ));
                    }

                    let span_index = store.add_span(
                        parent,
                        self.last_timestamp,
                        module.to_string(),
                        name,
                        args,
                        &mut outdated_spans,
                    );
                    store.complete_span(span_index);
                    self.spans += 1;
                    let index = self.traces.len();
                    self.traces.push(TraceData {
                        span_index,
                        ip_index,
                        parent_trace_index: parent_index,
                    });
                    self.instruction_pointers
                        .get_index_mut(ip_index)
                        .unwrap()
                        .1
                        .first_trace_of_ip
                        .get_or_insert(index);
                    if let Some(parent) = parent {
                        self.ip_parent_map.insert((ip_index, parent), index);
                    }
                }
                b'i' => {
                    let mut ip = InstructionPointer::read(&mut line)?;
                    if let Some(frame) = ip.frames.first()
                        && let Some(function) = self.strings.get(frame.function_index)
                    {
                        let crate_name = function
                            .strip_prefix('<')
                            .unwrap_or(function)
                            .split("::")
                            .next()
                            .unwrap()
                            .split('[')
                            .next()
                            .unwrap();
                        if self.collapse_crates.contains(crate_name)
                            || !self.expand_crates.is_empty()
                                && !self.expand_crates.contains(crate_name)
                        {
                            ip.frames.clear();
                            ip.custom_name = Some(crate_name.to_string());
                        }
                    }
                    match self.instruction_pointers.entry(ip) {
                        Entry::Occupied(e) => {
                            self.trace_instruction_pointers.push(e.index());
                        }
                        Entry::Vacant(e) => {
                            self.trace_instruction_pointers.push(e.index());
                            e.insert(InstructionPointerExtraInfo {
                                first_trace_of_ip: None,
                            });
                        }
                    }
                }
                b'#' => {
                    // comment
                }
                b'X' => {
                    let line = from_utf8(line)?;
                    println!("Debuggee: {line}");
                }
                b'c' => {
                    // timestamp
                    let timestamp = read_hex(&mut line)?;
                    self.last_timestamp = Timestamp::from_micros(timestamp);
                }
                b'a' => {
                    // allocation info
                    let info = AllocationInfo::read(&mut line)?;
                    self.allocations.push(info);
                }
                b'+' => {
                    // allocation
                    let index = read_hex_index(&mut line)?;
                    let AllocationInfo { size, trace_index } = self
                        .allocations
                        .get(index)
                        .context("allocation not found")?;
                    if *trace_index > 0 {
                        let TraceData { span_index, .. } =
                            self.traces.get(*trace_index).context("trace not found")?;
                        store.add_allocation(*span_index, *size, 1, &mut outdated_spans);
                        self.allocated_memory += *size;
                    }
                }
                b'-' => {
                    // deallocation
                    let index = read_hex_index(&mut line)?;
                    let AllocationInfo { size, trace_index } = self
                        .allocations
                        .get(index)
                        .context("allocation not found")?;
                    if *trace_index > 0 {
                        let TraceData { span_index, .. } =
                            self.traces.get(*trace_index).context("trace not found")?;
                        store.add_deallocation(*span_index, *size, 1, &mut outdated_spans);
                        self.allocated_memory -= *size;
                        self.temp_allocated_memory += *size;
                    }
                }
                b'R' => {
                    // RSS timestamp
                }
                b'A' => {
                    // attached
                    // ignore
                }
                b'S' => {
                    // embedded suppression
                    // ignore
                }
                b'I' => {
                    // System info
                    // ignore
                }
                _ => {
                    let line = from_utf8(line)?;
                    println!("{} {line}", ty as char)
                }
            }
        }
        store.invalidate_outdated_spans(&outdated_spans);
        Ok(bytes_read)
    }
}

fn read_hex_index(s: &mut &[u8]) -> anyhow::Result<usize> {
    Ok(read_hex(s)? as usize)
}

fn read_hex(s: &mut &[u8]) -> anyhow::Result<u64> {
    let mut n: u64 = 0;
    loop {
        if let Some(c) = s.first() {
            match c {
                b'0'..=b'9' => {
                    n *= 16;
                    n += (*c - b'0') as u64;
                }
                b'a'..=b'f' => {
                    n *= 16;
                    n += (*c - b'a' + 10) as u64;
                }
                b' ' => {
                    *s = &s[1..];
                    return Ok(n);
                }
                _ => {
                    bail!("Expected hex char");
                }
            }
            *s = &s[1..];
        } else {
            return Ok(n);
        }
    }
}

fn read_sized_string(s: &mut &[u8]) -> anyhow::Result<String> {
    let size = read_hex(s)? as usize;
    let str = &s[..size];
    *s = &s[size..];
    Ok(String::from_utf8(str.to_vec())?)
}

fn read_all<T>(
    s: &mut &[u8],
    f: impl Fn(&mut &[u8]) -> anyhow::Result<T>,
) -> anyhow::Result<Vec<T>> {
    let mut res = Vec::new();
    while !s.is_empty() {
        res.push(f(s)?);
    }
    Ok(res)
}
