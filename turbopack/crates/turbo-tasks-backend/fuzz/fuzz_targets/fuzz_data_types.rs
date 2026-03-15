#![no_main]
#![allow(dead_code)]

use libfuzzer_sys::fuzz_target;
use smallvec::SmallVec;
use turbo_bincode::{turbo_bincode_decode, turbo_bincode_encode};

#[path = "../../src/data.rs"]
mod data;

#[path = "../../src/error.rs"]
mod error;

use data::{
    AggregationNumber, CellRef, CollectibleRef, CollectiblesRef, Dirtyness, LeafDistance,
    OutputValue,
};

fn read_varint(data: &[u8]) -> Option<(u64, usize)> {
    let first = *data.first()?;
    match first {
        0x00..=0xFA => Some((first as u64, 1)),
        0xFB => {
            let b = data.get(1..3)?;
            Some((u16::from_le_bytes([b[0], b[1]]) as u64, 3))
        }
        0xFC => {
            let b = data.get(1..5)?;
            Some((u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as u64, 5))
        }
        0xFD => {
            let b = data.get(1..9)?;
            Some((
                u64::from_le_bytes([b[0], b[1], b[2], b[3], b[4], b[5], b[6], b[7]]),
                9,
            ))
        }
        _ => None,
    }
}

fn no_oversized_alloc(mut data: &[u8]) -> bool {
    while !data.is_empty() {
        match read_varint(data) {
            Some((len, consumed)) => {
                let remaining = data.len().saturating_sub(consumed);
                if len > remaining as u64 || len > 65536 {
                    return false;
                }
                data = &data[consumed..];
            }
            None => return true,
        }
    }
    true
}

fn roundtrip<T>(d: &[u8], label: &str)
where
    T: bincode::Encode + bincode::Decode<()> + PartialEq + std::fmt::Debug,
{
    let Ok(val) = turbo_bincode_decode::<T>(d) else {
        return;
    };
    let enc = turbo_bincode_encode(&val).unwrap_or_else(|e| panic!("{label} encode: {e:?}"));
    let dec = turbo_bincode_decode::<T>(&enc)
        .unwrap_or_else(|e| panic!("{label} roundtrip decode: {e:?}"));
    assert_eq!(val, dec, "{label} roundtrip mismatch");
    let enc2 =
        turbo_bincode_encode(&dec).unwrap_or_else(|e| panic!("{label} re-encode: {e:?}"));
    assert_eq!(enc, enc2, "{label} double-encode mismatch");
}

#[derive(bincode::Encode, bincode::Decode, PartialEq, Debug)]
struct WrapSmallVec(
    #[bincode(with = "turbo_bincode::smallvec")] SmallVec<[u8; 16]>,
);

fuzz_target!(|data: &[u8]| {
    if data.len() > 1 << 16 {
        return;
    }

    if !no_oversized_alloc(data) {
        return;
    }

    roundtrip::<CellRef>(data, "CellRef");
    roundtrip::<CollectibleRef>(data, "CollectibleRef");
    roundtrip::<CollectiblesRef>(data, "CollectiblesRef");
    roundtrip::<OutputValue>(data, "OutputValue");
    roundtrip::<AggregationNumber>(data, "AggregationNumber");
    roundtrip::<LeafDistance>(data, "LeafDistance");
    roundtrip::<Dirtyness>(data, "Dirtyness");

    for i in 0..data.len().min(32) {
        let s = &data[..i];
        if !no_oversized_alloc(s) {
            continue;
        }
        let _ = turbo_bincode_decode::<CellRef>(s);
        let _ = turbo_bincode_decode::<CollectibleRef>(s);
        let _ = turbo_bincode_decode::<OutputValue>(s);
        let _ = turbo_bincode_decode::<AggregationNumber>(s);
        let _ = turbo_bincode_decode::<LeafDistance>(s);
        let _ = turbo_bincode_decode::<Dirtyness>(s);
    }

    let sv: SmallVec<[u8; 16]> = data.iter().take(64).copied().collect();
    let wrapped = WrapSmallVec(sv);
    let enc = turbo_bincode_encode(&wrapped).expect("smallvec encode");
    if no_oversized_alloc(&enc) {
        let dec = turbo_bincode_decode::<WrapSmallVec>(&enc).expect("smallvec decode");
        assert_eq!(wrapped, dec, "smallvec roundtrip");
        let enc2 = turbo_bincode_encode(&dec).expect("smallvec re-encode");
        assert_eq!(enc, enc2, "smallvec double-encode");
    }
});