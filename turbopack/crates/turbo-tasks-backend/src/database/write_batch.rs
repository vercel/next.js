use std::{
    borrow::{Borrow, Cow},
    marker::PhantomData,
};

use anyhow::Result;

use crate::database::key_value_database::KeySpace;

pub trait BaseWriteBatch<'a> {
    type ValueBuffer<'l>: std::borrow::Borrow<[u8]>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l;
    fn commit(self) -> Result<()>;
}

pub trait SerialWriteBatch<'a>: BaseWriteBatch<'a> {
    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()>;
    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()>;
}

pub trait ConcurrentWriteBatch<'a>: BaseWriteBatch<'a> + Sync + Send {
    fn put(&self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()>;
    fn delete(&self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()>;
}

pub enum WriteBatch<'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    Serial(S),
    Concurrent(C, PhantomData<&'a ()>),
}

pub enum WriteBatchValueBuffer<S: Borrow<[u8]>, C: Borrow<[u8]>> {
    Serial(S),
    Concurrent(C),
}

impl<S: Borrow<[u8]>, C: Borrow<[u8]>> Borrow<[u8]> for WriteBatchValueBuffer<S, C> {
    fn borrow(&self) -> &[u8] {
        match self {
            WriteBatchValueBuffer::Serial(s) => s.borrow(),
            WriteBatchValueBuffer::Concurrent(c) => c.borrow(),
        }
    }
}

impl<'a, S, C> WriteBatch<'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    pub fn serial(s: S) -> Self {
        WriteBatch::Serial(s)
    }

    pub fn concurrent(c: C) -> Self {
        WriteBatch::Concurrent(c, PhantomData)
    }
}

impl<'a, S, C> BaseWriteBatch<'a> for WriteBatch<'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    type ValueBuffer<'l>
        = WriteBatchValueBuffer<S::ValueBuffer<'l>, C::ValueBuffer<'l>>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        Ok(match self {
            WriteBatch::Serial(s) => s.get(key_space, key)?.map(WriteBatchValueBuffer::Serial),
            WriteBatch::Concurrent(c, _) => c
                .get(key_space, key)?
                .map(WriteBatchValueBuffer::Concurrent),
        })
    }

    fn commit(self) -> Result<()> {
        match self {
            WriteBatch::Serial(s) => s.commit(),
            WriteBatch::Concurrent(c, _) => c.commit(),
        }
    }
}

impl<'a, S, C> SerialWriteBatch<'a> for WriteBatch<'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        match self {
            WriteBatch::Serial(s) => s.put(key_space, key, value),
            WriteBatch::Concurrent(c, _) => c.put(key_space, key, value),
        }
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        match self {
            WriteBatch::Serial(s) => s.delete(key_space, key),
            WriteBatch::Concurrent(c, _) => c.delete(key_space, key),
        }
    }
}

pub enum WriteBatchRef<'r, 'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    Serial(&'r mut S),
    Concurrent(&'r C, PhantomData<&'a ()>),
}

impl<'r, 'a, S, C> WriteBatchRef<'r, 'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    pub fn serial(s: &'r mut S) -> Self {
        WriteBatchRef::Serial(s)
    }

    pub fn concurrent(c: &'r C) -> Self {
        WriteBatchRef::Concurrent(c, PhantomData)
    }
}

impl<'a, S, C> BaseWriteBatch<'a> for WriteBatchRef<'_, 'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    type ValueBuffer<'l>
        = WriteBatchValueBuffer<S::ValueBuffer<'l>, C::ValueBuffer<'l>>
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, key_space: KeySpace, key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        Ok(match self {
            WriteBatchRef::Serial(s) => s.get(key_space, key)?.map(WriteBatchValueBuffer::Serial),
            WriteBatchRef::Concurrent(c, _) => c
                .get(key_space, key)?
                .map(WriteBatchValueBuffer::Concurrent),
        })
    }

    fn commit(self) -> Result<()> {
        // TODO change the traits to make this a type level constraint
        panic!("WriteBatchRef::commit is not usable");
    }
}

impl<'a, S, C> SerialWriteBatch<'a> for WriteBatchRef<'_, 'a, S, C>
where
    S: SerialWriteBatch<'a>,
    C: ConcurrentWriteBatch<'a>,
{
    fn put(&mut self, key_space: KeySpace, key: Cow<[u8]>, value: Cow<[u8]>) -> Result<()> {
        match self {
            WriteBatchRef::Serial(s) => s.put(key_space, key, value),
            WriteBatchRef::Concurrent(c, _) => c.put(key_space, key, value),
        }
    }

    fn delete(&mut self, key_space: KeySpace, key: Cow<[u8]>) -> Result<()> {
        match self {
            WriteBatchRef::Serial(s) => s.delete(key_space, key),
            WriteBatchRef::Concurrent(c, _) => c.delete(key_space, key),
        }
    }
}

pub struct UnimplementedWriteBatch;

impl<'a> BaseWriteBatch<'a> for UnimplementedWriteBatch {
    type ValueBuffer<'l>
        = &'l [u8]
    where
        Self: 'l,
        'a: 'l;

    fn get<'l>(&'l self, _key_space: KeySpace, _key: &[u8]) -> Result<Option<Self::ValueBuffer<'l>>>
    where
        'a: 'l,
    {
        todo!()
    }
    fn commit(self) -> Result<()> {
        todo!()
    }
}

impl SerialWriteBatch<'_> for UnimplementedWriteBatch {
    fn put(&mut self, _key_space: KeySpace, _key: Cow<[u8]>, _value: Cow<[u8]>) -> Result<()> {
        todo!()
    }
    fn delete(&mut self, _key_space: KeySpace, _key: Cow<[u8]>) -> Result<()> {
        todo!()
    }
}

impl ConcurrentWriteBatch<'_> for UnimplementedWriteBatch {
    fn put(&self, _key_space: KeySpace, _key: Cow<[u8]>, _value: Cow<[u8]>) -> Result<()> {
        todo!()
    }
    fn delete(&self, _key_space: KeySpace, _key: Cow<[u8]>) -> Result<()> {
        todo!()
    }
}
