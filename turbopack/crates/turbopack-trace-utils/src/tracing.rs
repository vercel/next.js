use std::{
    borrow::Cow,
    fmt::{Display, Formatter},
};

use serde::{Deserialize, Serialize};

/// A raw trace line.
///
/// # Timestamps
///
/// Timestamps are microseconds since the start of tracing. To keep the trace file small, the
/// `ts` fields of all rows except [`TraceRow::TimestampBase`] are serialized as the difference to
/// the timestamp of the previous row with a timestamp in the trace stream, as a zigzag encoded
/// signed number (`0, -1, 1, -2, 2, ...` are encoded as `0, 1, 2, 3, 4, ...`). The differences
/// can be negative, since rows are not necessarily in timestamp order. A
/// [`TraceRow::TimestampBase`] row sets an absolute timestamp that the next difference refers to.
/// The writer writes one before the first row with a timestamp in every thread local buffer, so
/// the rows of each buffer can be decoded no matter where the buffer ends up in the file.
///
/// Writers use a [`TimestampEncoder`] and readers a [`TimestampDecoder`] on every row in stream
/// order to convert between these differences and absolute timestamps.
#[derive(Debug, Serialize, Deserialize)]
pub enum TraceRow<'a> {
    /// A new span has been started, but not entered yet.
    Start {
        /// Timestamp
        ts: u64,
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
        ts: u64,
        /// Unique id for this span. Must be created by a `Start` event before.
        id: u64,
    },
    /// A span has been entered. This means it is spending CPU time now.
    Enter {
        /// Timestamp
        ts: u64,
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
        ts: u64,
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
        ts: u64,
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
        ts: u64,
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
    /// See "Timestamps" in the docs of [`TraceRow`].
    TimestampBase {
        /// Absolute timestamp
        ts: u64,
    },
}

impl TraceRow<'_> {
    /// The timestamp of this row, if it has one. This doesn't include
    /// [`TraceRow::TimestampBase`], which only defines the base for other timestamps.
    pub fn timestamp_mut(&mut self) -> Option<&mut u64> {
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
}

fn zigzag_encode(value: i64) -> u64 {
    ((value << 1) ^ (value >> 63)) as u64
}

fn zigzag_decode(value: u64) -> i64 {
    ((value >> 1) as i64) ^ -((value & 1) as i64)
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
    pub fn encode(&mut self, ts: u64) -> (Option<u64>, u64) {
        let delta = self
            .last
            .and_then(|last| i64::try_from(i128::from(ts) - i128::from(last)).ok());
        self.last = Some(ts);
        match delta {
            Some(delta) => (None, zigzag_encode(delta)),
            None => (Some(ts), zigzag_encode(0)),
        }
    }

    /// Converts the timestamp of `row` (if it has one) in place and returns the
    /// [`TraceRow::TimestampBase`] row that has to be written before it, if needed.
    pub fn encode_row(&mut self, row: &mut TraceRow<'_>) -> Option<TraceRow<'static>> {
        let ts = row.timestamp_mut()?;
        let (base, encoded) = self.encode(*ts);
        *ts = encoded;
        base.map(|ts| TraceRow::TimestampBase { ts })
    }
}

/// The trace stream contains an invalid timestamp.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimestampDecodeError {
    /// A row with a timestamp came before any [`TraceRow::TimestampBase`].
    MissingBase,
    /// Applying a timestamp difference over- or underflowed.
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
    /// Replaces the serialized timestamp of `row` (if it has one) with the absolute timestamp.
    /// [`TraceRow::TimestampBase`] rows update the state and are left unchanged.
    pub fn decode(&mut self, row: &mut TraceRow<'_>) -> Result<(), TimestampDecodeError> {
        if let TraceRow::TimestampBase { ts } = row {
            self.last = Some(*ts);
            return Ok(());
        }
        if let Some(ts) = row.timestamp_mut() {
            let last = self.last.ok_or(TimestampDecodeError::MissingBase)?;
            let decoded = last
                .checked_add_signed(zigzag_decode(*ts))
                .ok_or(TimestampDecodeError::Overflow)?;
            *ts = decoded;
            self.last = Some(decoded);
        }
        Ok(())
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
    use crate::tracing::{TimestampDecodeError, TimestampDecoder, TimestampEncoder, TraceRow};

    fn end(ts: u64) -> TraceRow<'static> {
        TraceRow::End { ts, id: 1 }
    }

    fn ts_of(row: &TraceRow<'_>) -> u64 {
        match row {
            TraceRow::End { ts, .. } | TraceRow::TimestampBase { ts } => *ts,
            _ => unreachable!(),
        }
    }

    /// Encodes the rows like the trace writer does (base rows included) and decodes them again.
    fn round_trip(timestamps: &[u64]) -> (Vec<TraceRow<'static>>, Vec<u64>) {
        let mut encoder = TimestampEncoder::default();
        let mut encoded = Vec::new();
        for &ts in timestamps {
            let mut row = end(ts);
            if let Some(base) = encoder.encode_row(&mut row) {
                encoded.push(base);
            }
            encoded.push(row);
        }
        let mut decoder = TimestampDecoder::default();
        let mut decoded = Vec::new();
        for mut row in encoded.iter().map(|row| match row {
            TraceRow::TimestampBase { ts } => TraceRow::TimestampBase { ts: *ts },
            row => end(ts_of(row)),
        }) {
            decoder.decode(&mut row).unwrap();
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
        // One base row at the start, the rows hold zigzag encoded deltas
        assert!(matches!(encoded[0], TraceRow::TimestampBase { ts: 1000 }));
        let deltas: Vec<u64> = encoded[1..].iter().map(ts_of).collect();
        assert_eq!(deltas, [0, 10, 3, 0, 1994, 3999, 14]);
    }

    #[test]
    fn out_of_range_delta_starts_a_new_base() {
        let timestamps = [0, u64::MAX, u64::MAX - 1, 0];
        let (encoded, decoded) = round_trip(&timestamps);
        assert_eq!(decoded, timestamps);
        let bases: Vec<u64> = encoded
            .iter()
            .filter(|row| matches!(row, TraceRow::TimestampBase { .. }))
            .map(ts_of)
            .collect();
        assert_eq!(bases, [0, u64::MAX, 0]);
    }

    #[test]
    fn reset_encoder_writes_a_new_base() {
        let mut encoder = TimestampEncoder::default();
        let mut row = end(10);
        assert!(encoder.encode_row(&mut row).is_some());
        let mut row = end(12);
        assert!(encoder.encode_row(&mut row).is_none());
        encoder = TimestampEncoder::default();
        let mut row = end(13);
        assert!(matches!(
            encoder.encode_row(&mut row),
            Some(TraceRow::TimestampBase { ts: 13 })
        ));
    }

    #[test]
    fn rows_without_timestamp_are_unchanged() {
        let mut encoder = TimestampEncoder::default();
        let mut decoder = TimestampDecoder::default();
        let mut record = TraceRow::Record {
            id: 5,
            values: Vec::new(),
        };
        assert!(encoder.encode_row(&mut record).is_none());
        decoder.decode(&mut record).unwrap();
        assert!(matches!(record, TraceRow::Record { id: 5, .. }));
        // No base was needed and none is pending: the first timestamp still gets a base.
        assert!(encoder.encode_row(&mut end(1)).is_some());
    }

    #[test]
    fn decoder_requires_a_base() {
        let mut decoder = TimestampDecoder::default();
        assert_eq!(
            decoder.decode(&mut end(4)),
            Err(TimestampDecodeError::MissingBase)
        );
    }

    #[test]
    fn decoder_detects_overflow() {
        let mut decoder = TimestampDecoder::default();
        decoder
            .decode(&mut TraceRow::TimestampBase { ts: u64::MAX - 1 })
            .unwrap();
        // zigzag(+5)
        assert_eq!(
            decoder.decode(&mut end(10)),
            Err(TimestampDecodeError::Overflow)
        );
        let mut decoder = TimestampDecoder::default();
        decoder
            .decode(&mut TraceRow::TimestampBase { ts: 1 })
            .unwrap();
        // zigzag(-2)
        assert_eq!(
            decoder.decode(&mut end(3)),
            Err(TimestampDecodeError::Overflow)
        );
    }
}
