use std::{
    borrow::Cow,
    convert::Infallible,
    fmt::{Display, Formatter},
};

use serde::{Deserialize, Serialize};

/// A timestamp as serialized in the trace stream: the signed difference in microseconds to the
/// timestamp of the previous row with a timestamp. See "Timestamps" in the docs of [`TraceRow`].
///
/// It is serialized like an `i64` (postcard zigzag encodes it).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(transparent)]
pub struct DeltaEncodedTimestamp(pub i64);

/// The magic bytes at the start of every trace file. They include the version of the trace
/// format, which must be bumped on every incompatible change to [`TraceRow`]. The header is
/// followed by a stream of [`postcard`] serialized [`TraceRow`]s.
pub const TRACE_HEADER: &[u8] = b"TRACEv1";

/// The part of [`TRACE_HEADER`] that is the same for all versions.
pub const TRACE_HEADER_PREFIX: &[u8] = b"TRACEv";

/// Checks that `data` starts with the [`TRACE_HEADER`] of the supported trace format version.
/// `data` must contain at least `TRACE_HEADER.len()` bytes, unless the file is shorter.
pub fn check_trace_header(data: &[u8]) -> anyhow::Result<()> {
    if data.starts_with(TRACE_HEADER) {
        return Ok(());
    }
    let expected = String::from_utf8_lossy(TRACE_HEADER);
    if data.starts_with(TRACE_HEADER_PREFIX) {
        let found = &data[..data.len().min(TRACE_HEADER.len())];
        anyhow::bail!(
            "Unsupported trace file version: expected {expected}, found {}",
            String::from_utf8_lossy(found)
        );
    }
    anyhow::bail!("Not a trace file: missing {expected} header");
}

/// A raw trace line.
///
/// # Timestamps
///
/// Timestamps are microseconds since the start of tracing. `T` is the type of the `ts` fields of
/// all rows except [`TraceRow::TimestampBase`]:
///
/// - `TraceRow<'a>` (`T` = [`DeltaEncodedTimestamp`]) is the serialized form. To keep the trace
///   file small, every timestamp is the signed difference to the timestamp of the previous row with
///   a timestamp in the trace stream (postcard zigzag encodes signed numbers, so small differences
///   in both directions take few bytes). The differences can be negative, since rows are not
///   necessarily in timestamp order. A [`TraceRow::TimestampBase`] row sets an absolute timestamp
///   that the next difference refers to. The writer writes one before the first row with a
///   timestamp in every thread local buffer, so the rows of each buffer can be decoded no matter
///   where the buffer ends up in the file.
/// - `TraceRow<'a, u64>` holds absolute timestamps.
///
/// Writers use a [`TimestampEncoder`] and readers a [`TimestampDecoder`] on every row in stream
/// order to convert between the two forms.
#[derive(Debug, Serialize, Deserialize)]
pub enum TraceRow<'a, T = DeltaEncodedTimestamp> {
    /// A new span has been started, but not entered yet.
    Start {
        /// Timestamp
        ts: T,
        /// Unique id for this span.
        id: u64,
        /// Id of the parent span, if any.
        parent: Option<u64>,
        /// The name of the span.
        #[serde(borrow)]
        name: Cow<'a, str>,
        /// The target of the span.
        #[serde(borrow)]
        target: Cow<'a, str>,
        /// A list of key-value pairs for all attributes of the span.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// A span has ended. The id might be reused in future.
    End {
        /// Timestamp
        ts: T,
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
    },
    /// A span has been entered. This means it is spending CPU time now.
    Enter {
        /// Timestamp
        ts: T,
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
        /// The thread id of the thread that entered the span.
        thread_id: u64,
        /// What the thread (de)allocated since its previous Enter/Exit row, if anything and if
        /// memory is tracked. See [`Allocations`].
        allocations: Option<Allocations>,
    },
    /// A span has been exited. This means it is not spending CPU time anymore.
    Exit {
        /// Timestamp
        ts: T,
        /// Unique id for this span. Must be entered by a `Enter` event before.
        id: u64,
        /// The thread id of the thread that exits the span.
        thread_id: u64,
        /// What the thread (de)allocated since its previous Enter/Exit row, if anything and if
        /// memory is tracked. See [`Allocations`].
        allocations: Option<Allocations>,
    },
    /// A event has happened for some span.
    Event {
        /// Timestamp
        ts: T,
        /// Id of the parent span, if any.
        parent: Option<u64>,
        /// A list of key-value pairs for all attributes of the event.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// Additional fields for a span
    Record {
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
        /// A list of key-value pairs for all attributes of the span.
        #[serde(borrow)]
        values: Vec<(Cow<'a, str>, TraceValue<'a>)>,
    },
    /// A snapshot of process memory and non-idle Tokio scheduler workers.
    MemorySample {
        /// Timestamp
        ts: T,
        /// Memory usage in bytes (from TurboMalloc::memory_usage())
        memory: u64,
        /// OS memory pressure in `0..=100` (from
        /// `TurboMalloc::memory_pressure()`). `0` is used when the current
        /// platform does not report a pressure value.
        memory_pressure: u8,
        /// Number of non-parked Tokio scheduler worker threads in this process.
        active_worker_threads: u64,
    },
    /// Sets the absolute timestamp that the `ts` of the next row with a timestamp is relative to.
    /// See "Timestamps" in the docs of [`TraceRow`]. Only meaningful in the serialized form.
    TimestampBase {
        /// Absolute timestamp
        ts: u64,
    },
}

impl<'a, T> TraceRow<'a, T> {
    /// The timestamp of this row, if it has one. This doesn't include
    /// [`TraceRow::TimestampBase`], which only defines the base for other timestamps.
    pub fn timestamp(&self) -> Option<&T> {
        match self {
            TraceRow::Start { ts, .. }
            | TraceRow::End { ts, .. }
            | TraceRow::Enter { ts, .. }
            | TraceRow::Exit { ts, .. }
            | TraceRow::Event { ts, .. }
            | TraceRow::MemorySample { ts, .. } => Some(ts),
            TraceRow::Record { .. } | TraceRow::TimestampBase { .. } => None,
        }
    }

    /// Converts the timestamp of this row (if it has one) with `f`, keeping everything else.
    pub fn map_timestamp<U>(self, f: impl FnOnce(T) -> U) -> TraceRow<'a, U> {
        let Ok(row) = self.try_map_timestamp(|ts| Ok::<_, Infallible>(f(ts)));
        row
    }

    /// Like [`TraceRow::map_timestamp`], but the conversion can fail.
    pub fn try_map_timestamp<U, E>(
        self,
        f: impl FnOnce(T) -> Result<U, E>,
    ) -> Result<TraceRow<'a, U>, E> {
        Ok(match self {
            TraceRow::Start {
                ts,
                id,
                parent,
                name,
                target,
                values,
            } => TraceRow::Start {
                ts: f(ts)?,
                id,
                parent,
                name,
                target,
                values,
            },
            TraceRow::End { ts, id } => TraceRow::End { ts: f(ts)?, id },
            TraceRow::Enter {
                ts,
                id,
                thread_id,
                allocations,
            } => TraceRow::Enter {
                ts: f(ts)?,
                id,
                thread_id,
                allocations,
            },
            TraceRow::Exit {
                ts,
                id,
                thread_id,
                allocations,
            } => TraceRow::Exit {
                ts: f(ts)?,
                id,
                thread_id,
                allocations,
            },
            TraceRow::Event { ts, parent, values } => TraceRow::Event {
                ts: f(ts)?,
                parent,
                values,
            },
            TraceRow::Record { id, values } => TraceRow::Record { id, values },
            TraceRow::MemorySample {
                ts,
                memory,
                memory_pressure,
                active_worker_threads,
            } => TraceRow::MemorySample {
                ts: f(ts)?,
                memory,
                memory_pressure,
                active_worker_threads,
            },
            TraceRow::TimestampBase { ts } => TraceRow::TimestampBase { ts },
        })
    }
}

/// Converts absolute timestamps into the serialized form of the trace stream. See "Timestamps" in
/// the docs of [`TraceRow`].
///
/// The state can be copied, so that it can be restored when a row is removed again.
#[derive(Debug, Default, Clone, Copy)]
pub struct TimestampEncoder {
    /// The previous timestamp, or `None` when the next timestamp needs a new base.
    last: Option<u64>,
}

impl TimestampEncoder {
    /// Returns the value to serialize for the absolute timestamp `ts`, and, if needed, the
    /// timestamp of a [`TraceRow::TimestampBase`] row that has to be written before it.
    ///
    /// A base is needed for the first timestamp, and when the difference to the previous
    /// timestamp doesn't fit into an `i64`.
    pub fn encode(&mut self, ts: u64) -> (Option<u64>, DeltaEncodedTimestamp) {
        let delta = self
            .last
            .and_then(|last| i64::try_from(i128::from(ts) - i128::from(last)).ok());
        self.last = Some(ts);
        match delta {
            Some(delta) => (None, DeltaEncodedTimestamp(delta)),
            None => (Some(ts), DeltaEncodedTimestamp(0)),
        }
    }

    /// Converts `row` into its serialized form. Also returns the [`TraceRow::TimestampBase`] row
    /// that has to be written before it, if needed.
    pub fn encode_row<'a>(
        &mut self,
        row: TraceRow<'a, u64>,
    ) -> (Option<TraceRow<'static>>, TraceRow<'a>) {
        let mut base = None;
        let row = row.map_timestamp(|ts| {
            let (new_base, encoded) = self.encode(ts);
            base = new_base.map(|ts| TraceRow::TimestampBase { ts });
            encoded
        });
        (base, row)
    }
}

/// The trace stream contains an invalid timestamp.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimestampDecodeError {
    /// A row with a timestamp came before any [`TraceRow::TimestampBase`].
    MissingBase,
    /// Applying a timestamp difference over- or underflowed `u64`.
    Overflow,
}

impl Display for TimestampDecodeError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TimestampDecodeError::MissingBase => {
                write!(
                    f,
                    "invalid trace: timestamp before the first timestamp base"
                )
            }
            TimestampDecodeError::Overflow => {
                write!(f, "invalid trace: timestamp out of range")
            }
        }
    }
}

impl std::error::Error for TimestampDecodeError {}

/// Converts the serialized timestamps of a trace stream back into absolute timestamps. Every
/// row has to be passed to [`TimestampDecoder::decode`] in stream order. See "Timestamps" in the
/// docs of [`TraceRow`].
#[derive(Debug, Default, Clone, Copy)]
pub struct TimestampDecoder {
    /// The previous timestamp, if a base was read already.
    last: Option<u64>,
}

impl TimestampDecoder {
    /// Converts `row` from its serialized form into the form with absolute timestamps.
    /// [`TraceRow::TimestampBase`] rows update the state and are kept.
    pub fn decode<'a>(
        &mut self,
        row: TraceRow<'a>,
    ) -> Result<TraceRow<'a, u64>, TimestampDecodeError> {
        if let TraceRow::TimestampBase { ts } = row {
            self.last = Some(ts);
        }
        row.try_map_timestamp(|DeltaEncodedTimestamp(delta)| {
            let last = self.last.ok_or(TimestampDecodeError::MissingBase)?;
            let decoded = last
                .checked_add_signed(delta)
                .ok_or(TimestampDecodeError::Overflow)?;
            self.last = Some(decoded);
            Ok(decoded)
        })
    }
}

/// The (de)allocations of a thread, as attached to [`TraceRow::Enter`] and
/// [`TraceRow::Exit`].
///
/// These are the (de)allocations of the thread since its previous `Enter` or
/// `Exit` row (allocations made by the tracing itself are excluded). A row
/// without allocations means that nothing was (de)allocated, or that memory
/// isn't tracked. Readers attribute them to the span on top of the thread's
/// span stack before the row is applied: for `Enter`, the span that was running
/// before (if any), for `Exit`, the span that is exited.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Allocations {
    /// Allocated bytes
    pub allocations: u64,
    /// Number of allocations
    pub allocation_count: u64,
    /// Deallocated bytes
    pub deallocations: u64,
    /// Number of deallocations
    pub deallocation_count: u64,
}

#[derive(Debug, Serialize, Deserialize)]
pub enum TraceValue<'a> {
    String(#[serde(borrow)] Cow<'a, str>),
    Bool(bool),
    UInt(u64),
    Int(i64),
    Float(f64),
}

impl Display for TraceValue<'_> {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            TraceValue::String(s) => write!(f, "{s}"),
            TraceValue::Bool(b) => write!(f, "{b}"),
            TraceValue::UInt(u) => write!(f, "{u}"),
            TraceValue::Int(i) => write!(f, "{i}"),
            TraceValue::Float(fl) => write!(f, "{fl}"),
        }
    }
}

impl TraceValue<'_> {
    pub fn as_u64(&self) -> Option<u64> {
        match self {
            TraceValue::UInt(u) => Some(*u),
            _ => None,
        }
    }

    pub fn as_str(&self) -> Option<&str> {
        match self {
            TraceValue::String(s) => Some(s),
            _ => None,
        }
    }

    pub fn into_static(self) -> TraceValue<'static> {
        match self {
            TraceValue::String(s) => TraceValue::String(s.into_owned().into()),
            TraceValue::Bool(b) => TraceValue::Bool(b),
            TraceValue::UInt(u) => TraceValue::UInt(u),
            TraceValue::Int(i) => TraceValue::Int(i),
            TraceValue::Float(fl) => TraceValue::Float(fl),
        }
    }
}

#[cfg(test)]
mod tests {
    use crate::tracing::{
        DeltaEncodedTimestamp, TimestampDecodeError, TimestampDecoder, TimestampEncoder, TraceRow,
        check_trace_header,
    };

    fn end(ts: u64) -> TraceRow<'static, u64> {
        TraceRow::End { ts, id: 1 }
    }

    fn encoded_end(delta: i64) -> TraceRow<'static> {
        TraceRow::End {
            ts: DeltaEncodedTimestamp(delta),
            id: 1,
        }
    }

    fn base(ts: u64) -> TraceRow<'static> {
        TraceRow::TimestampBase { ts }
    }

    /// The delta of an encoded `End` row.
    fn delta_of(row: &TraceRow<'_>) -> i64 {
        match row {
            TraceRow::End { ts, .. } => ts.0,
            _ => unreachable!(),
        }
    }

    /// The absolute timestamp of a decoded `End` row.
    fn ts_of(row: &TraceRow<'_, u64>) -> u64 {
        match row {
            TraceRow::End { ts, .. } => *ts,
            _ => unreachable!(),
        }
    }

    /// Encodes the rows like the trace writer does (base rows included) and decodes them again.
    fn round_trip(timestamps: &[u64]) -> (Vec<TraceRow<'static>>, Vec<u64>) {
        let mut encoder = TimestampEncoder::default();
        let mut encoded = Vec::new();
        for &ts in timestamps {
            let (base, row) = encoder.encode_row(end(ts));
            encoded.extend(base);
            encoded.push(row);
        }
        // Through the serialized form, like a reader sees it
        let bytes: Vec<Vec<u8>> = encoded
            .iter()
            .map(|row| postcard::to_stdvec(row).unwrap())
            .collect();
        let mut decoder = TimestampDecoder::default();
        let mut decoded = Vec::new();
        for bytes in &bytes {
            let row: TraceRow<'_> = postcard::from_bytes(bytes).unwrap();
            let row = decoder.decode(row).unwrap();
            if !matches!(row, TraceRow::TimestampBase { .. }) {
                decoded.push(ts_of(&row));
            }
        }
        (encoded, decoded)
    }

    #[test]
    fn timestamps_round_trip_with_negative_deltas() {
        let timestamps = [1000, 1005, 1003, 1003, 2000, 0, 7];
        let (encoded, decoded) = round_trip(&timestamps);
        assert_eq!(decoded, timestamps);
        // One base row at the start, the rows hold the signed deltas
        assert!(matches!(encoded[0], TraceRow::TimestampBase { ts: 1000 }));
        let deltas: Vec<i64> = encoded[1..].iter().map(delta_of).collect();
        assert_eq!(deltas, [0, 5, -2, 0, 997, -2000, 7]);
    }

    /// postcard zigzag encodes the signed deltas, so they are serialized exactly like the
    /// unsigned zigzag values used before.
    #[test]
    fn deltas_are_serialized_as_zigzag_varints() {
        fn zigzag(value: i64) -> u64 {
            ((value << 1) ^ (value >> 63)) as u64
        }
        for delta in [0, 1, -1, 5, -2, 1994, -3999, i64::MIN, i64::MAX] {
            let mut expected = postcard::to_stdvec(&TraceRow::End {
                ts: DeltaEncodedTimestamp(0),
                id: 7,
            })
            .unwrap();
            // The variant index, then the varint of `ts`, then `id`
            expected.splice(1..2, postcard::to_stdvec(&zigzag(delta)).unwrap());
            assert_eq!(
                postcard::to_stdvec(&TraceRow::End {
                    ts: DeltaEncodedTimestamp(delta),
                    id: 7
                })
                .unwrap(),
                expected,
                "delta {delta}"
            );
        }
    }

    #[test]
    fn out_of_range_delta_starts_a_new_base() {
        let mut encoder = TimestampEncoder::default();
        let encoded: Vec<_> = [0, u64::MAX, u64::MAX - 1, 0]
            .into_iter()
            .map(|ts| encoder.encode(ts))
            .collect();
        assert_eq!(
            encoded,
            [
                (Some(0), DeltaEncodedTimestamp(0)),
                (Some(u64::MAX), DeltaEncodedTimestamp(0)),
                (None, DeltaEncodedTimestamp(-1)),
                (Some(0), DeltaEncodedTimestamp(0))
            ]
        );
    }

    #[test]
    fn reset_encoder_writes_a_new_base() {
        let mut encoder = TimestampEncoder::default();
        assert!(encoder.encode_row(end(10)).0.is_some());
        assert!(encoder.encode_row(end(12)).0.is_none());
        encoder = TimestampEncoder::default();
        assert!(matches!(
            encoder.encode_row(end(13)).0,
            Some(TraceRow::TimestampBase { ts: 13 })
        ));
    }

    #[test]
    fn rows_without_timestamp_are_unchanged() {
        let mut encoder = TimestampEncoder::default();
        let mut decoder = TimestampDecoder::default();
        let (base, record) = encoder.encode_row(TraceRow::<u64>::Record {
            id: 5,
            values: Vec::new(),
        });
        assert!(base.is_none());
        let record = decoder.decode(record).unwrap();
        assert!(matches!(record, TraceRow::Record { id: 5, .. }));
        // No base was needed and none is pending: the first timestamp still gets a base.
        assert!(encoder.encode_row(end(1)).0.is_some());
    }

    #[test]
    fn decoder_keeps_timestamp_bases() {
        let mut decoder = TimestampDecoder::default();
        assert!(matches!(
            decoder.decode(base(42)),
            Ok(TraceRow::TimestampBase { ts: 42 })
        ));
        assert_eq!(ts_of(&decoder.decode(encoded_end(-2)).unwrap()), 40);
    }

    #[test]
    fn decoder_requires_a_base() {
        let mut decoder = TimestampDecoder::default();
        assert_eq!(
            decoder.decode(encoded_end(4)).unwrap_err(),
            TimestampDecodeError::MissingBase
        );
    }

    #[test]
    fn decoder_detects_overflow() {
        let mut decoder = TimestampDecoder::default();
        decoder.decode(base(u64::MAX - 1)).unwrap();
        assert_eq!(
            decoder.decode(encoded_end(5)).unwrap_err(),
            TimestampDecodeError::Overflow
        );
        let mut decoder = TimestampDecoder::default();
        decoder.decode(base(1)).unwrap();
        assert_eq!(
            decoder.decode(encoded_end(-2)).unwrap_err(),
            TimestampDecodeError::Overflow
        );
    }

    /// Decoded timestamps are `u64`, so they can exceed `i64::MAX`.
    #[test]
    fn decoder_accepts_timestamps_beyond_i64() {
        let beyond = i64::MAX as u64 + 5;
        let (_, decoded) = round_trip(&[beyond, beyond + 1, u64::MAX]);
        assert_eq!(decoded, [beyond, beyond + 1, u64::MAX]);
        let mut decoder = TimestampDecoder::default();
        decoder.decode(base(i64::MAX as u64)).unwrap();
        assert_eq!(ts_of(&decoder.decode(encoded_end(5)).unwrap()), beyond);
    }

    #[test]
    fn checks_trace_header() {
        assert!(check_trace_header(b"TRACEv1").is_ok());
        assert!(check_trace_header(b"TRACEv1\x00\x01").is_ok());
        assert_eq!(
            check_trace_header(b"TRACEv0\x00").unwrap_err().to_string(),
            "Unsupported trace file version: expected TRACEv1, found TRACEv0"
        );
        assert_eq!(
            check_trace_header(b"TRACEv2").unwrap_err().to_string(),
            "Unsupported trace file version: expected TRACEv1, found TRACEv2"
        );
        assert_eq!(
            check_trace_header(b"\x00\x01\x02").unwrap_err().to_string(),
            "Not a trace file: missing TRACEv1 header"
        );
        assert!(check_trace_header(b"").is_err());
    }
}
