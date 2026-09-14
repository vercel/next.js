/*
    LZ4 HC - High Compression Mode of LZ4
    Copyright (C) 2011-2020, Yann Collet.

    BSD 2-Clause License (http://www.opensource.org/licenses/bsd-license.php)

    Redistribution and use in source and binary forms, with or without
    modification, are permitted provided that the following conditions are
    met:

    * Redistributions of source code must retain the above copyright
    notice, this list of conditions and the following disclaimer.
    * Redistributions in binary form must reproduce the above
    copyright notice, this list of conditions and the following disclaimer
    in the documentation and/or other materials provided with the
    distribution.

    THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
    "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
    LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
    A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
    OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
    SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
    LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
    DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
    THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
    (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
    OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

    You can contact the author at :
       - LZ4 source repository : https://github.com/lz4/lz4
       - LZ4 public forum : https://groups.google.com/forum/#!forum/lz4c
*/
/* note : lz4hc is not an independent module, it requires lz4.h/lz4.c for proper compilation */


/* *************************************
*  Tuning Parameter
***************************************/

/*! HEAPMODE :
 *  Select how stateless HC compression functions like `LZ4_compress_HC()`
 *  allocate memory for their workspace:
 *  in stack (0:fastest), or in heap (1:default, requires malloc()).
 *  Since workspace is rather large, heap mode is recommended.
**/
#ifndef LZ4HC_HEAPMODE
#  define LZ4HC_HEAPMODE 1
#endif


/*===    Dependency    ===*/
#define LZ4_HC_STATIC_LINKING_ONLY
#include "lz4hc.h"
#include <limits.h>


/*===   Shared lz4.c code   ===*/
#ifndef LZ4_SRC_INCLUDED
# if defined(__GNUC__)
#  pragma GCC diagnostic ignored "-Wunused-function"
# endif
# if defined (__clang__)
#  pragma clang diagnostic ignored "-Wunused-function"
# endif
# define LZ4_COMMONDEFS_ONLY
# include "lz4.c"   /* LZ4_count, constants, mem */
#endif


/*===   Enums   ===*/
typedef enum { noDictCtx, usingDictCtxHc } dictCtx_directive;


/*===   Constants   ===*/
#define OPTIMAL_ML (int)((ML_MASK-1)+MINMATCH)
#define LZ4_OPT_NUM   (1<<12)


/*===   Macros   ===*/
#define MIN(a,b)   ( (a) < (b) ? (a) : (b) )
#define MAX(a,b)   ( (a) > (b) ? (a) : (b) )


/*===   Levels definition   ===*/
typedef enum { lz4mid, lz4hc, lz4opt } lz4hc_strat_e;
typedef struct {
    lz4hc_strat_e strat;
    int nbSearches;
    U32 targetLength;
} cParams_t;
static const cParams_t k_clTable[LZ4HC_CLEVEL_MAX+1] = {
    { lz4mid,    2, 16 },  /* 0, unused */
    { lz4mid,    2, 16 },  /* 1, unused */
    { lz4mid,    2, 16 },  /* 2 */
    { lz4hc,     4, 16 },  /* 3 */
    { lz4hc,     8, 16 },  /* 4 */
    { lz4hc,    16, 16 },  /* 5 */
    { lz4hc,    32, 16 },  /* 6 */
    { lz4hc,    64, 16 },  /* 7 */
    { lz4hc,   128, 16 },  /* 8 */
    { lz4hc,   256, 16 },  /* 9 */
    { lz4opt,   96, 64 },  /*10==LZ4HC_CLEVEL_OPT_MIN*/
    { lz4opt,  512,128 },  /*11 */
    { lz4opt,16384,LZ4_OPT_NUM },  /* 12==LZ4HC_CLEVEL_MAX */
};

static cParams_t LZ4HC_getCLevelParams(int cLevel)
{
    /* note : clevel convention is a bit different from lz4frame,
     * possibly something worth revisiting for consistency */
    if (cLevel < 1)
        cLevel = LZ4HC_CLEVEL_DEFAULT;
    cLevel = MIN(LZ4HC_CLEVEL_MAX, cLevel);
    return k_clTable[cLevel];
}


/*===   Hashing   ===*/
#define LZ4HC_HASHSIZE 4
#define HASH_FUNCTION(i)      (((i) * 2654435761U) >> ((MINMATCH*8)-LZ4HC_HASH_LOG))
static U32 LZ4HC_hashPtr(const void* ptr) { return HASH_FUNCTION(LZ4_read32(ptr)); }

#if defined(LZ4_FORCE_MEMORY_ACCESS) && (LZ4_FORCE_MEMORY_ACCESS==2)
/* lie to the compiler about data alignment; use with caution */
static U64 LZ4_read64(const void* memPtr) { return *(const U64*) memPtr; }

#elif defined(LZ4_FORCE_MEMORY_ACCESS) && (LZ4_FORCE_MEMORY_ACCESS==1)
/* __pack instructions are safer, but compiler specific */
LZ4_PACK(typedef struct { U64 u64; }) LZ4_unalign64;
static U64 LZ4_read64(const void* ptr) { return ((const LZ4_unalign64*)ptr)->u64; }

#else  /* safe and portable access using memcpy() */
static U64 LZ4_read64(const void* memPtr)
{
    U64 val; LZ4_memcpy(&val, memPtr, sizeof(val)); return val;
}

#endif /* LZ4_FORCE_MEMORY_ACCESS */

#define LZ4MID_HASHSIZE 8
#define LZ4MID_HASHLOG (LZ4HC_HASH_LOG-1)
#define LZ4MID_HASHTABLESIZE (1 << LZ4MID_HASHLOG)

static U32 LZ4MID_hash4(U32 v) { return (v * 2654435761U) >> (32-LZ4MID_HASHLOG); }
static U32 LZ4MID_hash4Ptr(const void* ptr) { return LZ4MID_hash4(LZ4_read32(ptr)); }
/* note: hash7 hashes the lower 56-bits.
 * It presumes input was read using little endian.*/
static U32 LZ4MID_hash7(U64 v) { return (U32)(((v  << (64-56)) * 58295818150454627ULL) >> (64-LZ4MID_HASHLOG)) ; }
static U64 LZ4_readLE64(const void* memPtr);
static U32 LZ4MID_hash8Ptr(const void* ptr) { return LZ4MID_hash7(LZ4_readLE64(ptr)); }

static U64 LZ4_readLE64(const void* memPtr)
{
    if (LZ4_isLittleEndian()) {
        return LZ4_read64(memPtr);
    } else {
        const BYTE* p = (const BYTE*)memPtr;
        /* note: relies on the compiler to simplify this expression */
        return (U64)p[0] | ((U64)p[1]<<8) | ((U64)p[2]<<16) | ((U64)p[3]<<24)
            | ((U64)p[4]<<32) | ((U64)p[5]<<40) | ((U64)p[6]<<48) | ((U64)p[7]<<56);
    }
}


/*===   Count match length   ===*/
LZ4_FORCE_INLINE
unsigned LZ4HC_NbCommonBytes32(U32 val)
{
    assert(val != 0);
    if (LZ4_isLittleEndian()) {
#     if defined(_MSC_VER) && (_MSC_VER >= 1400) && !defined(LZ4_FORCE_SW_BITCOUNT)
        unsigned long r;
        _BitScanReverse(&r, val);
        return (unsigned)((31 - r) >> 3);
#     elif (defined(__clang__) || (defined(__GNUC__) && ((__GNUC__ > 3) || \
                            ((__GNUC__ == 3) && (__GNUC_MINOR__ >= 4))))) && \
                                        !defined(LZ4_FORCE_SW_BITCOUNT)
        return (unsigned)__builtin_clz(val) >> 3;
#     else
        val >>= 8;
        val = ((((val + 0x00FFFF00) | 0x00FFFFFF) + val) |
              (val + 0x00FF0000)) >> 24;
        return (unsigned)val ^ 3;
#     endif
    } else {
#     if defined(_MSC_VER) && (_MSC_VER >= 1400) && !defined(LZ4_FORCE_SW_BITCOUNT)
        unsigned long r;
        _BitScanForward(&r, val);
        return (unsigned)(r >> 3);
#     elif (defined(__clang__) || (defined(__GNUC__) && ((__GNUC__ > 3) || \
                            ((__GNUC__ == 3) && (__GNUC_MINOR__ >= 4))))) && \
                                        !defined(LZ4_FORCE_SW_BITCOUNT)
        return (unsigned)__builtin_ctz(val) >> 3;
#     else
        const U32 m = 0x01010101;
        return (unsigned)((((val - 1) ^ val) & (m - 1)) * m) >> 24;
#     endif
    }
}

/** LZ4HC_countBack() :
 * @return : negative value, nb of common bytes before ip/match */
LZ4_FORCE_INLINE
int LZ4HC_countBack(const BYTE* const ip, const BYTE* const match,
                    const BYTE* const iMin, const BYTE* const mMin)
{
    int back = 0;
    int const min = (int)MAX(iMin - ip, mMin - match);
    assert(min <= 0);
    assert(ip >= iMin); assert((size_t)(ip-iMin) < (1U<<31));
    assert(match >= mMin); assert((size_t)(match - mMin) < (1U<<31));

    while ((back - min) > 3) {
        U32 const v = LZ4_read32(ip + back - 4) ^ LZ4_read32(match + back - 4);
        if (v) {
            return (back - (int)LZ4HC_NbCommonBytes32(v));
        } else back -= 4; /* 4-byte step */
    }
    /* check remainder if any */
    while ( (back > min)
         && (ip[back-1] == match[back-1]) )
            back--;
    return back;
}

/*===   Chain table updates   ===*/
#define DELTANEXTU16(table, pos) table[(U16)(pos)]   /* faster */
/* Make fields passed to, and updated by LZ4HC_encodeSequence explicit */
#define UPDATABLE(ip, op, anchor) &ip, &op, &anchor


/**************************************
*  Init
**************************************/
static void LZ4HC_clearTables (LZ4HC_CCtx_internal* hc4)
{
    MEM_INIT(hc4->hashTable, 0, sizeof(hc4->hashTable));
    MEM_INIT(hc4->chainTable, 0xFF, sizeof(hc4->chainTable));
}

static void LZ4HC_init_internal (LZ4HC_CCtx_internal* hc4, const BYTE* start)
{
    size_t const bufferSize = (size_t)(hc4->end - hc4->prefixStart);
    size_t newStartingOffset = bufferSize + hc4->dictLimit;
    DEBUGLOG(5, "LZ4HC_init_internal");
    assert(newStartingOffset >= bufferSize);  /* check overflow */
    if (newStartingOffset > 1 GB) {
        LZ4HC_clearTables(hc4);
        newStartingOffset = 0;
    }
    newStartingOffset += 64 KB;
    hc4->nextToUpdate = (U32)newStartingOffset;
    hc4->prefixStart = start;
    hc4->end = start;
    hc4->dictStart = start;
    hc4->dictLimit = (U32)newStartingOffset;
    hc4->lowLimit = (U32)newStartingOffset;
}


/**************************************
*  Encode
**************************************/
/* LZ4HC_encodeSequence() :
 * @return : 0 if ok,
 *           1 if buffer issue detected */
LZ4_FORCE_INLINE int LZ4HC_encodeSequence (
    const BYTE** _ip,
    BYTE** _op,
    const BYTE** _anchor,
    int matchLength,
    int offset,
    limitedOutput_directive limit,
    BYTE* oend)
{
#define ip      (*_ip)
#define op      (*_op)
#define anchor  (*_anchor)

    size_t length;
    BYTE* const token = op++;

#if defined(LZ4_DEBUG) && (LZ4_DEBUG >= 6)
    static const BYTE* start = NULL;
    static U32 totalCost = 0;
    U32 const pos = (start==NULL) ? 0 : (U32)(anchor - start);
    U32 const ll = (U32)(ip - anchor);
    U32 const llAdd = (ll>=15) ? ((ll-15) / 255) + 1 : 0;
    U32 const mlAdd = (matchLength>=19) ? ((matchLength-19) / 255) + 1 : 0;
    U32 const cost = 1 + llAdd + ll + 2 + mlAdd;
    if (start==NULL) start = anchor;  /* only works for single segment */
    /* g_debuglog_enable = (pos >= 2228) & (pos <= 2262); */
    DEBUGLOG(6, "pos:%7u -- literals:%4u, match:%4i, offset:%5i, cost:%4u + %5u",
                pos,
                (U32)(ip - anchor), matchLength, offset,
                cost, totalCost);
    totalCost += cost;
#endif

    /* Encode Literal length */
    length = (size_t)(ip - anchor);
    LZ4_STATIC_ASSERT(notLimited == 0);
    /* Check output limit */
    if (limit && ((op + (length / 255) + length + (2 + 1 + LASTLITERALS)) > oend)) {
        DEBUGLOG(6, "Not enough room to write %i literals (%i bytes remaining)",
                (int)length, (int)(oend - op));
        return 1;
    }
    if (length >= RUN_MASK) {
        size_t len = length - RUN_MASK;
        *token = (RUN_MASK << ML_BITS);
        for(; len >= 255 ; len -= 255) *op++ = 255;
        *op++ = (BYTE)len;
    } else {
        *token = (BYTE)(length << ML_BITS);
    }

    /* Copy Literals */
    LZ4_wildCopy8(op, anchor, op + length);
    op += length;

    /* Encode Offset */
    assert(offset <= LZ4_DISTANCE_MAX );
    assert(offset > 0);
    LZ4_writeLE16(op, (U16)(offset)); op += 2;

    /* Encode MatchLength */
    assert(matchLength >= MINMATCH);
    length = (size_t)matchLength - MINMATCH;
    if (limit && (op + (length / 255) + (1 + LASTLITERALS) > oend)) {
        DEBUGLOG(6, "Not enough room to write match length");
        return 1;   /* Check output limit */
    }
    if (length >= ML_MASK) {
        *token += ML_MASK;
        length -= ML_MASK;
        for(; length >= 510 ; length -= 510) { *op++ = 255; *op++ = 255; }
        if (length >= 255) { length -= 255; *op++ = 255; }
        *op++ = (BYTE)length;
    } else {
        *token += (BYTE)(length);
    }

    /* Prepare next loop */
    ip += matchLength;
    anchor = ip;

    return 0;

#undef ip
#undef op
#undef anchor
}


typedef struct {
    int off;
    int len;
    int back;  /* negative value */
} LZ4HC_match_t;

LZ4HC_match_t LZ4HC_searchExtDict(const BYTE* ip, U32 ipIndex,
        const BYTE* const iLowLimit, const BYTE* const iHighLimit,
        const LZ4HC_CCtx_internal* dictCtx, U32 gDictEndIndex,
        int currentBestML, int nbAttempts)
{
    size_t const lDictEndIndex = (size_t)(dictCtx->end - dictCtx->prefixStart) + dictCtx->dictLimit;
    U32 lDictMatchIndex = dictCtx->hashTable[LZ4HC_hashPtr(ip)];
    U32 matchIndex = lDictMatchIndex + gDictEndIndex - (U32)lDictEndIndex;
    int offset = 0, sBack = 0;
    assert(lDictEndIndex <= 1 GB);
    if (lDictMatchIndex>0)
        DEBUGLOG(7, "lDictEndIndex = %zu, lDictMatchIndex = %u", lDictEndIndex, lDictMatchIndex);
    while (ipIndex - matchIndex <= LZ4_DISTANCE_MAX && nbAttempts--) {
        const BYTE* const matchPtr = dictCtx->prefixStart - dictCtx->dictLimit + lDictMatchIndex;

        if (LZ4_read32(matchPtr) == LZ4_read32(ip)) {
            int mlt;
            int back = 0;
            const BYTE* vLimit = ip + (lDictEndIndex - lDictMatchIndex);
            if (vLimit > iHighLimit) vLimit = iHighLimit;
            mlt = (int)LZ4_count(ip+MINMATCH, matchPtr+MINMATCH, vLimit) + MINMATCH;
            back = (ip > iLowLimit) ? LZ4HC_countBack(ip, matchPtr, iLowLimit, dictCtx->prefixStart) : 0;
            mlt -= back;
            if (mlt > currentBestML) {
                currentBestML = mlt;
                offset = (int)(ipIndex - matchIndex);
                sBack = back;
                DEBUGLOG(7, "found match of length %i within extDictCtx", currentBestML);
        }   }

        {   U32 const nextOffset = DELTANEXTU16(dictCtx->chainTable, lDictMatchIndex);
            lDictMatchIndex -= nextOffset;
            matchIndex -= nextOffset;
    }   }

    {   LZ4HC_match_t md;
        md.len = currentBestML;
        md.off = offset;
        md.back = sBack;
        return md;
    }
}

typedef LZ4HC_match_t (*LZ4MID_searchIntoDict_f)(const BYTE* ip, U32 ipIndex,
        const BYTE* const iHighLimit,
        const LZ4HC_CCtx_internal* dictCtx, U32 gDictEndIndex);

static LZ4HC_match_t LZ4MID_searchHCDict(const BYTE* ip, U32 ipIndex,
        const BYTE* const iHighLimit,
        const LZ4HC_CCtx_internal* dictCtx, U32 gDictEndIndex)
{
    return LZ4HC_searchExtDict(ip,ipIndex,
                            ip, iHighLimit,
                            dictCtx, gDictEndIndex,
                            MINMATCH-1, 2);
}

static LZ4HC_match_t LZ4MID_searchExtDict(const BYTE* ip, U32 ipIndex,
        const BYTE* const iHighLimit,
        const LZ4HC_CCtx_internal* dictCtx, U32 gDictEndIndex)
{
    size_t const lDictEndIndex = (size_t)(dictCtx->end - dictCtx->prefixStart) + dictCtx->dictLimit;
    const U32* const hash4Table = dictCtx->hashTable;
    const U32* const hash8Table = hash4Table + LZ4MID_HASHTABLESIZE;
    DEBUGLOG(7, "LZ4MID_searchExtDict (ipIdx=%u)", ipIndex);

    /* search long match first */
    {   U32 l8DictMatchIndex = hash8Table[LZ4MID_hash8Ptr(ip)];
        U32 m8Index = l8DictMatchIndex + gDictEndIndex - (U32)lDictEndIndex;
        assert(lDictEndIndex <= 1 GB);
        if (ipIndex - m8Index <= LZ4_DISTANCE_MAX) {
            const BYTE* const matchPtr = dictCtx->prefixStart - dictCtx->dictLimit + l8DictMatchIndex;
            const size_t safeLen = MIN(lDictEndIndex - l8DictMatchIndex, (size_t)(iHighLimit - ip));
            int mlt = (int)LZ4_count(ip, matchPtr, ip + safeLen);
            if (mlt >= MINMATCH) {
                LZ4HC_match_t md;
                DEBUGLOG(7, "Found long ExtDict match of len=%u", mlt);
                md.len = mlt;
                md.off = (int)(ipIndex - m8Index);
                md.back = 0;
                return md;
            }
        }
    }

    /* search for short match second */
    {   U32 l4DictMatchIndex = hash4Table[LZ4MID_hash4Ptr(ip)];
        U32 m4Index = l4DictMatchIndex + gDictEndIndex - (U32)lDictEndIndex;
        if (ipIndex - m4Index <= LZ4_DISTANCE_MAX) {
            const BYTE* const matchPtr = dictCtx->prefixStart - dictCtx->dictLimit + l4DictMatchIndex;
            const size_t safeLen = MIN(lDictEndIndex - l4DictMatchIndex, (size_t)(iHighLimit - ip));
            int mlt = (int)LZ4_count(ip, matchPtr, ip + safeLen);
            if (mlt >= MINMATCH) {
                LZ4HC_match_t md;
                DEBUGLOG(7, "Found short ExtDict match of len=%u", mlt);
                md.len = mlt;
                md.off = (int)(ipIndex - m4Index);
                md.back = 0;
                return md;
            }
        }
    }

    /* nothing found */
    {   LZ4HC_match_t const md = {0, 0, 0 };
        return md;
    }
}

/**************************************
*  Mid Compression (level 2)
**************************************/

LZ4_FORCE_INLINE void
LZ4MID_addPosition(U32* hTable, U32 hValue, U32 index)
{
    hTable[hValue] = index;
}

#define ADDPOS8(_p, _idx) LZ4MID_addPosition(hash8Table, LZ4MID_hash8Ptr(_p), _idx)
#define ADDPOS4(_p, _idx) LZ4MID_addPosition(hash4Table, LZ4MID_hash4Ptr(_p), _idx)

/* Fill hash tables with references into dictionary.
 * The resulting table is only exploitable by LZ4MID (level 2) */
static void
LZ4MID_fillHTable (LZ4HC_CCtx_internal* cctx, const void* dict, size_t size)
{
    U32* const hash4Table = cctx->hashTable;
    U32* const hash8Table = hash4Table + LZ4MID_HASHTABLESIZE;
    const BYTE* const prefixPtr = (const BYTE*)dict;
    U32 const prefixIdx = cctx->dictLimit;
    U32 const target = prefixIdx + (U32)size - LZ4MID_HASHSIZE;
    U32 idx = cctx->nextToUpdate;
    assert(dict == cctx->prefixStart);
    DEBUGLOG(4, "LZ4MID_fillHTable (size:%zu)", size);
    if (size <= LZ4MID_HASHSIZE)
        return;

    for (; idx < target; idx += 3) {
        ADDPOS4(prefixPtr+idx-prefixIdx, idx);
        ADDPOS8(prefixPtr+idx+1-prefixIdx, idx+1);
    }

    idx = (size > 32 KB + LZ4MID_HASHSIZE) ? target - 32 KB : cctx->nextToUpdate;
    for (; idx < target; idx += 1) {
        ADDPOS8(prefixPtr+idx-prefixIdx, idx);
    }

    cctx->nextToUpdate = target;
}

static LZ4MID_searchIntoDict_f select_searchDict_function(const LZ4HC_CCtx_internal* dictCtx)
{
    if (dictCtx == NULL) return NULL;
    if (LZ4HC_getCLevelParams(dictCtx->compressionLevel).strat == lz4mid)
        return LZ4MID_searchExtDict;
    return LZ4MID_searchHCDict;
}

static int LZ4MID_compress (
    LZ4HC_CCtx_internal* const ctx,
    const char* const src,
    char* const dst,
    int* srcSizePtr,
    int const maxOutputSize,
    const limitedOutput_directive limit,
    const dictCtx_directive dict
    )
{
    U32* const hash4Table = ctx->hashTable;
    U32* const hash8Table = hash4Table + LZ4MID_HASHTABLESIZE;
    const BYTE* ip = (const BYTE*)src;
    const BYTE* anchor = ip;
    const BYTE* const iend = ip + *srcSizePtr;
    const BYTE* const mflimit = iend - MFLIMIT;
    const BYTE* const matchlimit = (iend - LASTLITERALS);
    const BYTE* const ilimit = (iend - LZ4MID_HASHSIZE);
    BYTE* op = (BYTE*)dst;
    BYTE* oend = op + maxOutputSize;

    const BYTE* const prefixPtr = ctx->prefixStart;
    const U32 prefixIdx = ctx->dictLimit;
    const U32 ilimitIdx = (U32)(ilimit - prefixPtr) + prefixIdx;
    const BYTE* const dictStart = ctx->dictStart;
    const U32 dictIdx = ctx->lowLimit;
    const U32 gDictEndIndex = ctx->lowLimit;
    const LZ4MID_searchIntoDict_f searchIntoDict = (dict == usingDictCtxHc) ? select_searchDict_function(ctx->dictCtx) : NULL;
    unsigned matchLength;
    unsigned matchDistance;

    /* input sanitization */
    DEBUGLOG(5, "LZ4MID_compress (%i bytes)", *srcSizePtr);
    if (dict == usingDictCtxHc) DEBUGLOG(5, "usingDictCtxHc");
    assert(*srcSizePtr >= 0);
    if (*srcSizePtr) assert(src != NULL);
    if (maxOutputSize) assert(dst != NULL);
    if (*srcSizePtr < 0) return 0;  /* invalid */
    if (maxOutputSize < 0) return 0; /* invalid */
    if (*srcSizePtr > LZ4_MAX_INPUT_SIZE) {
        /* forbidden: no input is allowed to be that large */
        return 0;
    }
    if (limit == fillOutput) oend -= LASTLITERALS;  /* Hack for support LZ4 format restriction */
    if (*srcSizePtr < LZ4_minLength)
        goto _lz4mid_last_literals;  /* Input too small, no compression (all literals) */

    /* main loop */
    while (ip <= mflimit) {
        const U32 ipIndex = (U32)(ip - prefixPtr) + prefixIdx;
        /* search long match */
        {   U32 const h8 = LZ4MID_hash8Ptr(ip);
            U32 const pos8 = hash8Table[h8];
            assert(h8 < LZ4MID_HASHTABLESIZE);
            assert(pos8 < ipIndex);
            LZ4MID_addPosition(hash8Table, h8, ipIndex);
            if (ipIndex - pos8 <= LZ4_DISTANCE_MAX) {
                /* match candidate found */
                if (pos8 >= prefixIdx) {
                    const BYTE* const matchPtr = prefixPtr + pos8 - prefixIdx;
                    assert(matchPtr < ip);
                    matchLength = LZ4_count(ip, matchPtr, matchlimit);
                    if (matchLength >= MINMATCH) {
                        DEBUGLOG(7, "found long match at pos %u (len=%u)", pos8, matchLength);
                        matchDistance = ipIndex - pos8;
                        goto _lz4mid_encode_sequence;
                    }
                } else {
                    if (pos8 >= dictIdx) {
                        /* extDict match candidate */
                        const BYTE* const matchPtr = dictStart + (pos8 - dictIdx);
                        const size_t safeLen = MIN(prefixIdx - pos8, (size_t)(matchlimit - ip));
                        matchLength = LZ4_count(ip, matchPtr, ip + safeLen);
                        if (matchLength >= MINMATCH) {
                            DEBUGLOG(7, "found long match at ExtDict pos %u (len=%u)", pos8, matchLength);
                            matchDistance = ipIndex - pos8;
                            goto _lz4mid_encode_sequence;
                        }
                    }
                }
        }   }
        /* search short match */
        {   U32 const h4 = LZ4MID_hash4Ptr(ip);
            U32 const pos4 = hash4Table[h4];
            assert(h4 < LZ4MID_HASHTABLESIZE);
            assert(pos4 < ipIndex);
            LZ4MID_addPosition(hash4Table, h4, ipIndex);
            if (ipIndex - pos4 <= LZ4_DISTANCE_MAX) {
                /* match candidate found */
                if (pos4 >= prefixIdx) {
                /* only search within prefix */
                    const BYTE* const matchPtr = prefixPtr + (pos4 - prefixIdx);
                    assert(matchPtr < ip);
                    assert(matchPtr >= prefixPtr);
                    matchLength = LZ4_count(ip, matchPtr, matchlimit);
                    if (matchLength >= MINMATCH) {
                        /* short match found, let's just check ip+1 for longer */
                        U32 const h8 = LZ4MID_hash8Ptr(ip+1);
                        U32 const pos8 = hash8Table[h8];
                        U32 const m2Distance = ipIndex + 1 - pos8;
                        matchDistance = ipIndex - pos4;
                        if ( m2Distance <= LZ4_DISTANCE_MAX
                        && pos8 >= prefixIdx /* only search within prefix */
                        && likely(ip < mflimit)
                        ) {
                            const BYTE* const m2Ptr = prefixPtr + (pos8 - prefixIdx);
                            unsigned ml2 = LZ4_count(ip+1, m2Ptr, matchlimit);
                            if (ml2 > matchLength) {
                                LZ4MID_addPosition(hash8Table, h8, ipIndex+1);
                                ip++;
                                matchLength = ml2;
                                matchDistance = m2Distance;
                        }   }
                        goto _lz4mid_encode_sequence;
                    }
                } else {
                    if (pos4 >= dictIdx) {
                        /* extDict match candidate */
                        const BYTE* const matchPtr = dictStart + (pos4 - dictIdx);
                        const size_t safeLen = MIN(prefixIdx - pos4, (size_t)(matchlimit - ip));
                        matchLength = LZ4_count(ip, matchPtr, ip + safeLen);
                        if (matchLength >= MINMATCH) {
                            DEBUGLOG(7, "found match at ExtDict pos %u (len=%u)", pos4, matchLength);
                            matchDistance = ipIndex - pos4;
                            goto _lz4mid_encode_sequence;
                        }
                    }
                }
        }   }
        /* no match found in prefix */
        if ( (dict == usingDictCtxHc)
          && (ipIndex - gDictEndIndex < LZ4_DISTANCE_MAX - 8) ) {
            /* search a match into external dictionary */
            LZ4HC_match_t dMatch = searchIntoDict(ip, ipIndex,
                    matchlimit,
                    ctx->dictCtx, gDictEndIndex);
            if (dMatch.len >= MINMATCH) {
                DEBUGLOG(7, "found Dictionary match (offset=%i)", dMatch.off);
                assert(dMatch.back == 0);
                matchLength = (unsigned)dMatch.len;
                matchDistance = (unsigned)dMatch.off;
                goto _lz4mid_encode_sequence;
            }
        }
        /* no match found */
        ip += 1 + ((ip-anchor) >> 9);  /* skip faster over incompressible data */
        continue;

_lz4mid_encode_sequence:
        /* catch back */
        while (((ip > anchor) & ((U32)(ip-prefixPtr) > matchDistance)) && (unlikely(ip[-1] == ip[-(int)matchDistance-1]))) {
            ip--;  matchLength++;
        };

        /* fill table with beginning of match */
        ADDPOS8(ip+1, ipIndex+1);
        ADDPOS8(ip+2, ipIndex+2);
        ADDPOS4(ip+1, ipIndex+1);

        /* encode */
        {   BYTE* const saved_op = op;
            /* LZ4HC_encodeSequence always updates @op; on success, it updates @ip and @anchor */
            if (LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                    (int)matchLength, (int)matchDistance,
                    limit, oend) ) {
                op = saved_op;  /* restore @op value before failed LZ4HC_encodeSequence */
                goto _lz4mid_dest_overflow;
            }
        }

        /* fill table with end of match */
        {   U32 endMatchIdx = (U32)(ip-prefixPtr) + prefixIdx;
            U32 pos_m2 = endMatchIdx - 2;
            if (pos_m2 < ilimitIdx) {
                if (likely(ip - prefixPtr > 5)) {
                    ADDPOS8(ip-5, endMatchIdx - 5);
                }
                ADDPOS8(ip-3, endMatchIdx - 3);
                ADDPOS8(ip-2, endMatchIdx - 2);
                ADDPOS4(ip-2, endMatchIdx - 2);
                ADDPOS4(ip-1, endMatchIdx - 1);
            }
        }
    }

_lz4mid_last_literals:
    /* Encode Last Literals */
    {   size_t lastRunSize = (size_t)(iend - anchor);  /* literals */
        size_t llAdd = (lastRunSize + 255 - RUN_MASK) / 255;
        size_t const totalSize = 1 + llAdd + lastRunSize;
        if (limit == fillOutput) oend += LASTLITERALS;  /* restore correct value */
        if (limit && (op + totalSize > oend)) {
            if (limit == limitedOutput) return 0;  /* not enough space in @dst */
            /* adapt lastRunSize to fill 'dest' */
            lastRunSize  = (size_t)(oend - op) - 1 /*token*/;
            llAdd = (lastRunSize + 256 - RUN_MASK) / 256;
            lastRunSize -= llAdd;
        }
        DEBUGLOG(6, "Final literal run : %i literals", (int)lastRunSize);
        ip = anchor + lastRunSize;  /* can be != iend if limit==fillOutput */

        if (lastRunSize >= RUN_MASK) {
            size_t accumulator = lastRunSize - RUN_MASK;
            *op++ = (RUN_MASK << ML_BITS);
            for(; accumulator >= 255 ; accumulator -= 255)
                *op++ = 255;
            *op++ = (BYTE) accumulator;
        } else {
            *op++ = (BYTE)(lastRunSize << ML_BITS);
        }
        assert(lastRunSize <= (size_t)(oend - op));
        LZ4_memcpy(op, anchor, lastRunSize);
        op += lastRunSize;
    }

    /* End */
    DEBUGLOG(5, "compressed %i bytes into %i bytes", *srcSizePtr, (int)((char*)op - dst));
    assert(ip >= (const BYTE*)src);
    assert(ip <= iend);
    *srcSizePtr = (int)(ip - (const BYTE*)src);
    assert((char*)op >= dst);
    assert(op <= oend);
    assert((char*)op - dst < INT_MAX);
    return (int)((char*)op - dst);

_lz4mid_dest_overflow:
    if (limit == fillOutput) {
        /* Assumption : @ip, @anchor, @optr and @matchLength must be set correctly */
        size_t const ll = (size_t)(ip - anchor);
        size_t const ll_addbytes = (ll + 240) / 255;
        size_t const ll_totalCost = 1 + ll_addbytes + ll;
        BYTE* const maxLitPos = oend - 3; /* 2 for offset, 1 for token */
        DEBUGLOG(6, "Last sequence is overflowing : %u literals, %u remaining space",
                (unsigned)ll, (unsigned)(oend-op));
        if (op + ll_totalCost <= maxLitPos) {
            /* ll validated; now adjust match length */
            size_t const bytesLeftForMl = (size_t)(maxLitPos - (op+ll_totalCost));
            size_t const maxMlSize = MINMATCH + (ML_MASK-1) + (bytesLeftForMl * 255);
            assert(maxMlSize < INT_MAX);
            if ((size_t)matchLength > maxMlSize) matchLength= (unsigned)maxMlSize;
            if ((oend + LASTLITERALS) - (op + ll_totalCost + 2) - 1 + matchLength >= MFLIMIT) {
            DEBUGLOG(6, "Let's encode a last sequence (ll=%u, ml=%u)", (unsigned)ll, matchLength);
                LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                        (int)matchLength, (int)matchDistance,
                        notLimited, oend);
        }   }
        DEBUGLOG(6, "Let's finish with a run of literals (%u bytes left)", (unsigned)(oend-op));
        goto _lz4mid_last_literals;
    }
    /* compression failed */
    return 0;
}


/**************************************
*  HC Compression - Search
**************************************/

/* Update chains up to ip (excluded) */
LZ4_FORCE_INLINE void LZ4HC_Insert (LZ4HC_CCtx_internal* hc4, const BYTE* ip)
{
    U16* const chainTable = hc4->chainTable;
    U32* const hashTable  = hc4->hashTable;
    const BYTE* const prefixPtr = hc4->prefixStart;
    U32 const prefixIdx = hc4->dictLimit;
    U32 const target = (U32)(ip - prefixPtr) + prefixIdx;
    U32 idx = hc4->nextToUpdate;
    assert(ip >= prefixPtr);
    assert(target >= prefixIdx);

    while (idx < target) {
        U32 const h = LZ4HC_hashPtr(prefixPtr+idx-prefixIdx);
        size_t delta = idx - hashTable[h];
        if (delta>LZ4_DISTANCE_MAX) delta = LZ4_DISTANCE_MAX;
        DELTANEXTU16(chainTable, idx) = (U16)delta;
        hashTable[h] = idx;
        idx++;
    }

    hc4->nextToUpdate = target;
}

#if defined(_MSC_VER)
#  define LZ4HC_rotl32(x,r) _rotl(x,r)
#else
#  define LZ4HC_rotl32(x,r) ((x << r) | (x >> (32 - r)))
#endif


static U32 LZ4HC_rotatePattern(size_t const rotate, U32 const pattern)
{
    size_t const bitsToRotate = (rotate & (sizeof(pattern) - 1)) << 3;
    if (bitsToRotate == 0) return pattern;
    return LZ4HC_rotl32(pattern, (int)bitsToRotate);
}

/* LZ4HC_countPattern() :
 * pattern32 must be a sample of repetitive pattern of length 1, 2 or 4 (but not 3!) */
static unsigned
LZ4HC_countPattern(const BYTE* ip, const BYTE* const iEnd, U32 const pattern32)
{
    const BYTE* const iStart = ip;
    reg_t const pattern = (sizeof(pattern)==8) ?
        (reg_t)pattern32 + (((reg_t)pattern32) << (sizeof(pattern)*4)) : pattern32;

    while (likely(ip < iEnd-(sizeof(pattern)-1))) {
        reg_t const diff = LZ4_read_ARCH(ip) ^ pattern;
        if (!diff) { ip+=sizeof(pattern); continue; }
        ip += LZ4_NbCommonBytes(diff);
        return (unsigned)(ip - iStart);
    }

    if (LZ4_isLittleEndian()) {
        reg_t patternByte = pattern;
        while ((ip<iEnd) && (*ip == (BYTE)patternByte)) {
            ip++; patternByte >>= 8;
        }
    } else {  /* big endian */
        U32 bitOffset = (sizeof(pattern)*8) - 8;
        while (ip < iEnd) {
            BYTE const byte = (BYTE)(pattern >> bitOffset);
            if (*ip != byte) break;
            ip ++; bitOffset -= 8;
    }   }

    return (unsigned)(ip - iStart);
}

/* LZ4HC_reverseCountPattern() :
 * pattern must be a sample of repetitive pattern of length 1, 2 or 4 (but not 3!)
 * read using natural platform endianness */
static unsigned
LZ4HC_reverseCountPattern(const BYTE* ip, const BYTE* const iLow, U32 pattern)
{
    const BYTE* const iStart = ip;

    while (likely(ip >= iLow+4)) {
        if (LZ4_read32(ip-4) != pattern) break;
        ip -= 4;
    }
    {   const BYTE* bytePtr = (const BYTE*)(&pattern) + 3; /* works for any endianness */
        while (likely(ip>iLow)) {
            if (ip[-1] != *bytePtr) break;
            ip--; bytePtr--;
    }   }
    return (unsigned)(iStart - ip);
}

/* LZ4HC_protectDictEnd() :
 * Checks if the match is in the last 3 bytes of the dictionary, so reading the
 * 4 byte MINMATCH would overflow.
 * @returns true if the match index is okay.
 */
static int LZ4HC_protectDictEnd(U32 const dictLimit, U32 const matchIndex)
{
    return ((U32)((dictLimit - 1) - matchIndex) >= 3);
}

typedef enum { rep_untested, rep_not, rep_confirmed } repeat_state_e;
typedef enum { favorCompressionRatio=0, favorDecompressionSpeed } HCfavor_e;


LZ4_FORCE_INLINE LZ4HC_match_t
LZ4HC_InsertAndGetWiderMatch (
        LZ4HC_CCtx_internal* const hc4,
        const BYTE* const ip,
        const BYTE* const iLowLimit, const BYTE* const iHighLimit,
        int longest,
        const int maxNbAttempts,
        const int patternAnalysis, const int chainSwap,
        const dictCtx_directive dict,
        const HCfavor_e favorDecSpeed)
{
    U16* const chainTable = hc4->chainTable;
    U32* const hashTable = hc4->hashTable;
    const LZ4HC_CCtx_internal* const dictCtx = hc4->dictCtx;
    const BYTE* const prefixPtr = hc4->prefixStart;
    const U32 prefixIdx = hc4->dictLimit;
    const U32 ipIndex = (U32)(ip - prefixPtr) + prefixIdx;
    const int withinStartDistance = (hc4->lowLimit + (LZ4_DISTANCE_MAX + 1) > ipIndex);
    const U32 lowestMatchIndex = (withinStartDistance) ? hc4->lowLimit : ipIndex - LZ4_DISTANCE_MAX;
    const BYTE* const dictStart = hc4->dictStart;
    const U32 dictIdx = hc4->lowLimit;
    const BYTE* const dictEnd = dictStart + prefixIdx - dictIdx;
    int const lookBackLength = (int)(ip-iLowLimit);
    int nbAttempts = maxNbAttempts;
    U32 matchChainPos = 0;
    U32 const pattern = LZ4_read32(ip);
    U32 matchIndex;
    repeat_state_e repeat = rep_untested;
    size_t srcPatternLength = 0;
    int offset = 0, sBack = 0;

    DEBUGLOG(7, "LZ4HC_InsertAndGetWiderMatch");
    /* First Match */
    LZ4HC_Insert(hc4, ip);  /* insert all prior positions up to ip (excluded) */
    matchIndex = hashTable[LZ4HC_hashPtr(ip)];
    DEBUGLOG(7, "First candidate match for pos %u found at index %u / %u (lowestMatchIndex)",
                ipIndex, matchIndex, lowestMatchIndex);

    while ((matchIndex>=lowestMatchIndex) && (nbAttempts>0)) {
        int matchLength=0;
        nbAttempts--;
        assert(matchIndex < ipIndex);
        if (favorDecSpeed && (ipIndex - matchIndex < 8)) {
            /* do nothing:
             * favorDecSpeed intentionally skips matches with offset < 8 */
        } else if (matchIndex >= prefixIdx) {   /* within current Prefix */
            const BYTE* const matchPtr = prefixPtr + (matchIndex - prefixIdx);
            assert(matchPtr < ip);
            assert(longest >= 1);
            if (LZ4_read16(iLowLimit + longest - 1) == LZ4_read16(matchPtr - lookBackLength + longest - 1)) {
                if (LZ4_read32(matchPtr) == pattern) {
                    int const back = lookBackLength ? LZ4HC_countBack(ip, matchPtr, iLowLimit, prefixPtr) : 0;
                    matchLength = MINMATCH + (int)LZ4_count(ip+MINMATCH, matchPtr+MINMATCH, iHighLimit);
                    matchLength -= back;
                    if (matchLength > longest) {
                        longest = matchLength;
                        offset = (int)(ipIndex - matchIndex);
                        sBack = back;
                        DEBUGLOG(7, "Found match of len=%i within prefix, offset=%i, back=%i", longest, offset, -back);
            }   }   }
        } else {   /* lowestMatchIndex <= matchIndex < dictLimit : within Ext Dict */
            const BYTE* const matchPtr = dictStart + (matchIndex - dictIdx);
            assert(matchIndex >= dictIdx);
            if ( likely(matchIndex <= prefixIdx - 4)
              && (LZ4_read32(matchPtr) == pattern) ) {
                int back = 0;
                const BYTE* vLimit = ip + (prefixIdx - matchIndex);
                if (vLimit > iHighLimit) vLimit = iHighLimit;
                matchLength = (int)LZ4_count(ip+MINMATCH, matchPtr+MINMATCH, vLimit) + MINMATCH;
                if ((ip+matchLength == vLimit) && (vLimit < iHighLimit))
                    matchLength += LZ4_count(ip+matchLength, prefixPtr, iHighLimit);
                back = lookBackLength ? LZ4HC_countBack(ip, matchPtr, iLowLimit, dictStart) : 0;
                matchLength -= back;
                if (matchLength > longest) {
                    longest = matchLength;
                    offset = (int)(ipIndex - matchIndex);
                    sBack = back;
                    DEBUGLOG(7, "Found match of len=%i within dict, offset=%i, back=%i", longest, offset, -back);
        }   }   }

        if (chainSwap && matchLength==longest) {   /* better match => select a better chain */
            assert(lookBackLength==0);   /* search forward only */
            if (matchIndex + (U32)longest <= ipIndex) {
                int const kTrigger = 4;
                U32 distanceToNextMatch = 1;
                int const end = longest - MINMATCH + 1;
                int step = 1;
                int accel = 1 << kTrigger;
                int pos;
                for (pos = 0; pos < end; pos += step) {
                    U32 const candidateDist = DELTANEXTU16(chainTable, matchIndex + (U32)pos);
                    step = (accel++ >> kTrigger);
                    if (candidateDist > distanceToNextMatch) {
                        distanceToNextMatch = candidateDist;
                        matchChainPos = (U32)pos;
                        accel = 1 << kTrigger;
                }   }
                if (distanceToNextMatch > 1) {
                    if (distanceToNextMatch > matchIndex) break;   /* avoid overflow */
                    matchIndex -= distanceToNextMatch;
                    continue;
        }   }   }

        {   U32 const distNextMatch = DELTANEXTU16(chainTable, matchIndex);
            if (patternAnalysis && distNextMatch==1 && matchChainPos==0) {
                U32 const matchCandidateIdx = matchIndex-1;
                /* may be a repeated pattern */
                if (repeat == rep_untested) {
                    if ( ((pattern & 0xFFFF) == (pattern >> 16))
                      &  ((pattern & 0xFF)   == (pattern >> 24)) ) {
                        DEBUGLOG(7, "Repeat pattern detected, char %02X", pattern >> 24);
                        repeat = rep_confirmed;
                        srcPatternLength = LZ4HC_countPattern(ip+sizeof(pattern), iHighLimit, pattern) + sizeof(pattern);
                    } else {
                        repeat = rep_not;
                }   }
                if ( (repeat == rep_confirmed) && (matchCandidateIdx >= lowestMatchIndex)
                  && LZ4HC_protectDictEnd(prefixIdx, matchCandidateIdx) ) {
                    const int extDict = matchCandidateIdx < prefixIdx;
                    const BYTE* const matchPtr = extDict ? dictStart + (matchCandidateIdx - dictIdx) : prefixPtr + (matchCandidateIdx - prefixIdx);
                    if (LZ4_read32(matchPtr) == pattern) {  /* good candidate */
                        const BYTE* const iLimit = extDict ? dictEnd : iHighLimit;
                        size_t forwardPatternLength = LZ4HC_countPattern(matchPtr+sizeof(pattern), iLimit, pattern) + sizeof(pattern);
                        if (extDict && matchPtr + forwardPatternLength == iLimit) {
                            U32 const rotatedPattern = LZ4HC_rotatePattern(forwardPatternLength, pattern);
                            forwardPatternLength += LZ4HC_countPattern(prefixPtr, iHighLimit, rotatedPattern);
                        }
                        {   const BYTE* const lowestMatchPtr = extDict ? dictStart : prefixPtr;
                            size_t backLength = LZ4HC_reverseCountPattern(matchPtr, lowestMatchPtr, pattern);
                            size_t currentSegmentLength;
                            if (!extDict
                              && matchPtr - backLength == prefixPtr
                              && dictIdx < prefixIdx) {
                                U32 const rotatedPattern = LZ4HC_rotatePattern((U32)(-(int)backLength), pattern);
                                backLength += LZ4HC_reverseCountPattern(dictEnd, dictStart, rotatedPattern);
                            }
                            /* Limit backLength not go further than lowestMatchIndex */
                            backLength = matchCandidateIdx - MAX(matchCandidateIdx - (U32)backLength, lowestMatchIndex);
                            assert(matchCandidateIdx - backLength >= lowestMatchIndex);
                            currentSegmentLength = backLength + forwardPatternLength;
                            /* Adjust to end of pattern if the source pattern fits, otherwise the beginning of the pattern */
                            if ( (currentSegmentLength >= srcPatternLength)   /* current pattern segment large enough to contain full srcPatternLength */
                              && (forwardPatternLength <= srcPatternLength) ) { /* haven't reached this position yet */
                                U32 const newMatchIndex = matchCandidateIdx + (U32)forwardPatternLength - (U32)srcPatternLength;  /* best position, full pattern, might be followed by more match */
                                if (LZ4HC_protectDictEnd(prefixIdx, newMatchIndex))
                                    matchIndex = newMatchIndex;
                                else {
                                    /* Can only happen if started in the prefix */
                                    assert(newMatchIndex >= prefixIdx - 3 && newMatchIndex < prefixIdx && !extDict);
                                    matchIndex = prefixIdx;
                                }
                            } else {
                                U32 const newMatchIndex = matchCandidateIdx - (U32)backLength;   /* farthest position in current segment, will find a match of length currentSegmentLength + maybe some back */
                                if (!LZ4HC_protectDictEnd(prefixIdx, newMatchIndex)) {
                                    assert(newMatchIndex >= prefixIdx - 3 && newMatchIndex < prefixIdx && !extDict);
                                    matchIndex = prefixIdx;
                                } else {
                                    matchIndex = newMatchIndex;
                                    if (lookBackLength==0) {  /* no back possible */
                                        size_t const maxML = MIN(currentSegmentLength, srcPatternLength);
                                        if ((size_t)longest < maxML) {
                                            assert(prefixPtr - prefixIdx + matchIndex != ip);
                                            if ((size_t)(ip - prefixPtr) + prefixIdx - matchIndex > LZ4_DISTANCE_MAX) break;
                                            assert(maxML < 2 GB);
                                            longest = (int)maxML;
                                            offset = (int)(ipIndex - matchIndex);
                                            assert(sBack == 0);
                                            DEBUGLOG(7, "Found repeat pattern match of len=%i, offset=%i", longest, offset);
                                        }
                                        {   U32 const distToNextPattern = DELTANEXTU16(chainTable, matchIndex);
                                            if (distToNextPattern > matchIndex) break;  /* avoid overflow */
                                            matchIndex -= distToNextPattern;
                        }   }   }   }   }
                        continue;
                }   }
        }   }   /* PA optimization */

        /* follow current chain */
        matchIndex -= DELTANEXTU16(chainTable, matchIndex + matchChainPos);

    }  /* while ((matchIndex>=lowestMatchIndex) && (nbAttempts)) */

    if ( dict == usingDictCtxHc
      && nbAttempts > 0
      && withinStartDistance) {
        size_t const dictEndOffset = (size_t)(dictCtx->end - dictCtx->prefixStart) + dictCtx->dictLimit;
        U32 dictMatchIndex = dictCtx->hashTable[LZ4HC_hashPtr(ip)];
        assert(dictEndOffset <= 1 GB);
        matchIndex = dictMatchIndex + lowestMatchIndex - (U32)dictEndOffset;
        if (dictMatchIndex>0) DEBUGLOG(7, "dictEndOffset = %zu, dictMatchIndex = %u => relative matchIndex = %i", dictEndOffset, dictMatchIndex, (int)dictMatchIndex - (int)dictEndOffset);
        while (ipIndex - matchIndex <= LZ4_DISTANCE_MAX && nbAttempts--) {
            const BYTE* const matchPtr = dictCtx->prefixStart - dictCtx->dictLimit + dictMatchIndex;

            if (LZ4_read32(matchPtr) == pattern) {
                int mlt;
                int back = 0;
                const BYTE* vLimit = ip + (dictEndOffset - dictMatchIndex);
                if (vLimit > iHighLimit) vLimit = iHighLimit;
                mlt = (int)LZ4_count(ip+MINMATCH, matchPtr+MINMATCH, vLimit) + MINMATCH;
                back = lookBackLength ? LZ4HC_countBack(ip, matchPtr, iLowLimit, dictCtx->prefixStart) : 0;
                mlt -= back;
                if (mlt > longest) {
                    longest = mlt;
                    offset = (int)(ipIndex - matchIndex);
                    sBack = back;
                    DEBUGLOG(7, "found match of length %i within extDictCtx", longest);
            }   }

            {   U32 const nextOffset = DELTANEXTU16(dictCtx->chainTable, dictMatchIndex);
                dictMatchIndex -= nextOffset;
                matchIndex -= nextOffset;
    }   }   }

    {   LZ4HC_match_t md;
        assert(longest >= 0);
        md.len = longest;
        md.off = offset;
        md.back = sBack;
        return md;
    }
}

LZ4_FORCE_INLINE LZ4HC_match_t
LZ4HC_InsertAndFindBestMatch(LZ4HC_CCtx_internal* const hc4,   /* Index table will be updated */
                       const BYTE* const ip, const BYTE* const iLimit,
                       const int maxNbAttempts,
                       const int patternAnalysis,
                       const dictCtx_directive dict)
{
    DEBUGLOG(7, "LZ4HC_InsertAndFindBestMatch");
    /* note : LZ4HC_InsertAndGetWiderMatch() is able to modify the starting position of a match (*startpos),
     * but this won't be the case here, as we define iLowLimit==ip,
     * so LZ4HC_InsertAndGetWiderMatch() won't be allowed to search past ip */
    return LZ4HC_InsertAndGetWiderMatch(hc4, ip, ip, iLimit, MINMATCH-1, maxNbAttempts, patternAnalysis, 0 /*chainSwap*/, dict, favorCompressionRatio);
}


LZ4_FORCE_INLINE int LZ4HC_compress_hashChain (
    LZ4HC_CCtx_internal* const ctx,
    const char* const source,
    char* const dest,
    int* srcSizePtr,
    int const maxOutputSize,
    int maxNbAttempts,
    const limitedOutput_directive limit,
    const dictCtx_directive dict
    )
{
    const int inputSize = *srcSizePtr;
    const int patternAnalysis = (maxNbAttempts > 128);   /* levels 9+ */

    const BYTE* ip = (const BYTE*) source;
    const BYTE* anchor = ip;
    const BYTE* const iend = ip + inputSize;
    const BYTE* const mflimit = iend - MFLIMIT;
    const BYTE* const matchlimit = (iend - LASTLITERALS);

    BYTE* optr = (BYTE*) dest;
    BYTE* op = (BYTE*) dest;
    BYTE* oend = op + maxOutputSize;

    const BYTE* start0;
    const BYTE* start2 = NULL;
    const BYTE* start3 = NULL;
    LZ4HC_match_t m0, m1, m2, m3;
    const LZ4HC_match_t nomatch = {0, 0, 0};

    /* init */
    DEBUGLOG(5, "LZ4HC_compress_hashChain (dict?=>%i)", dict);
    *srcSizePtr = 0;
    if (limit == fillOutput) oend -= LASTLITERALS;                  /* Hack for support LZ4 format restriction */
    if (inputSize < LZ4_minLength) goto _last_literals;             /* Input too small, no compression (all literals) */

    /* Main Loop */
    while (ip <= mflimit) {
        m1 = LZ4HC_InsertAndFindBestMatch(ctx, ip, matchlimit, maxNbAttempts, patternAnalysis, dict);
        if (m1.len<MINMATCH) { ip++; continue; }

        /* saved, in case we would skip too much */
        start0 = ip; m0 = m1;

_Search2:
        DEBUGLOG(7, "_Search2 (currently found match of size %i)", m1.len);
        if (ip+m1.len <= mflimit) {
            start2 = ip + m1.len - 2;
            m2 = LZ4HC_InsertAndGetWiderMatch(ctx,
                            start2, ip + 0, matchlimit, m1.len,
                            maxNbAttempts, patternAnalysis, 0, dict, favorCompressionRatio);
            start2 += m2.back;
        } else {
            m2 = nomatch;  /* do not search further */
        }

        if (m2.len <= m1.len) { /* No better match => encode ML1 immediately */
            optr = op;
            if (LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                    m1.len, m1.off,
                    limit, oend) )
                goto _dest_overflow;
            continue;
        }

        if (start0 < ip) {   /* first match was skipped at least once */
            if (start2 < ip + m0.len) {  /* squeezing ML1 between ML0(original ML1) and ML2 */
                ip = start0; m1 = m0;  /* restore initial Match1 */
        }   }

        /* Here, start0==ip */
        if ((start2 - ip) < 3) {  /* First Match too small : removed */
            ip = start2;
            m1 = m2;
            goto _Search2;
        }

_Search3:
        if ((start2 - ip) < OPTIMAL_ML) {
            int correction;
            int new_ml = m1.len;
            if (new_ml > OPTIMAL_ML) new_ml = OPTIMAL_ML;
            if (ip+new_ml > start2 + m2.len - MINMATCH)
                new_ml = (int)(start2 - ip) + m2.len - MINMATCH;
            correction = new_ml - (int)(start2 - ip);
            if (correction > 0) {
                start2 += correction;
                m2.len -= correction;
            }
        }

        if (start2 + m2.len <= mflimit) {
            start3 = start2 + m2.len - 3;
            m3 = LZ4HC_InsertAndGetWiderMatch(ctx,
                            start3, start2, matchlimit, m2.len,
                            maxNbAttempts, patternAnalysis, 0, dict, favorCompressionRatio);
            start3 += m3.back;
        } else {
            m3 = nomatch;  /* do not search further */
        }

        if (m3.len <= m2.len) {  /* No better match => encode ML1 and ML2 */
            /* ip & ref are known; Now for ml */
            if (start2 < ip+m1.len) m1.len = (int)(start2 - ip);
            /* Now, encode 2 sequences */
            optr = op;
            if (LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                    m1.len, m1.off,
                    limit, oend) )
                goto _dest_overflow;
            ip = start2;
            optr = op;
            if (LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                    m2.len, m2.off,
                    limit, oend) ) {
                m1 = m2;
                goto _dest_overflow;
            }
            continue;
        }

        if (start3 < ip+m1.len+3) {  /* Not enough space for match 2 : remove it */
            if (start3 >= (ip+m1.len)) {  /* can write Seq1 immediately ==> Seq2 is removed, so Seq3 becomes Seq1 */
                if (start2 < ip+m1.len) {
                    int correction = (int)(ip+m1.len - start2);
                    start2 += correction;
                    m2.len -= correction;
                    if (m2.len < MINMATCH) {
                        start2 = start3;
                        m2 = m3;
                    }
                }

                optr = op;
                if (LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                        m1.len, m1.off,
                        limit, oend) )
                    goto _dest_overflow;
                ip  = start3;
                m1 = m3;

                start0 = start2;
                m0 = m2;
                goto _Search2;
            }

            start2 = start3;
            m2 = m3;
            goto _Search3;
        }

        /*
        * OK, now we have 3 ascending matches;
        * let's write the first one ML1.
        * ip & ref are known; Now decide ml.
        */
        if (start2 < ip+m1.len) {
            if ((start2 - ip) < OPTIMAL_ML) {
                int correction;
                if (m1.len > OPTIMAL_ML) m1.len = OPTIMAL_ML;
                if (ip + m1.len > start2 + m2.len - MINMATCH)
                    m1.len = (int)(start2 - ip) + m2.len - MINMATCH;
                correction = m1.len - (int)(start2 - ip);
                if (correction > 0) {
                    start2 += correction;
                    m2.len -= correction;
                }
            } else {
                m1.len = (int)(start2 - ip);
            }
        }
        optr = op;
        if ( LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor),
                m1.len, m1.off,
                limit, oend) )
            goto _dest_overflow;

        /* ML2 becomes ML1 */
        ip = start2; m1 = m2;

        /* ML3 becomes ML2 */
        start2 = start3; m2 = m3;

        /* let's find a new ML3 */
        goto _Search3;
    }

_last_literals:
    /* Encode Last Literals */
    {   size_t lastRunSize = (size_t)(iend - anchor);  /* literals */
        size_t llAdd = (lastRunSize + 255 - RUN_MASK) / 255;
        size_t const totalSize = 1 + llAdd + lastRunSize;
        if (limit == fillOutput) oend += LASTLITERALS;  /* restore correct value */
        if (limit && (op + totalSize > oend)) {
            if (limit == limitedOutput) return 0;
            /* adapt lastRunSize to fill 'dest' */
            lastRunSize  = (size_t)(oend - op) - 1 /*token*/;
            llAdd = (lastRunSize + 256 - RUN_MASK) / 256;
            lastRunSize -= llAdd;
        }
        DEBUGLOG(6, "Final literal run : %i literals", (int)lastRunSize);
        ip = anchor + lastRunSize;  /* can be != iend if limit==fillOutput */

        if (lastRunSize >= RUN_MASK) {
            size_t accumulator = lastRunSize - RUN_MASK;
            *op++ = (RUN_MASK << ML_BITS);
            for(; accumulator >= 255 ; accumulator -= 255) *op++ = 255;
            *op++ = (BYTE) accumulator;
        } else {
            *op++ = (BYTE)(lastRunSize << ML_BITS);
        }
        LZ4_memcpy(op, anchor, lastRunSize);
        op += lastRunSize;
    }

    /* End */
    *srcSizePtr = (int) (((const char*)ip) - source);
    return (int) (((char*)op)-dest);

_dest_overflow:
    if (limit == fillOutput) {
        /* Assumption : @ip, @anchor, @optr and @m1 must be set correctly */
        size_t const ll = (size_t)(ip - anchor);
        size_t const ll_addbytes = (ll + 240) / 255;
        size_t const ll_totalCost = 1 + ll_addbytes + ll;
        BYTE* const maxLitPos = oend - 3; /* 2 for offset, 1 for token */
        DEBUGLOG(6, "Last sequence overflowing");
        op = optr;  /* restore correct out pointer */
        if (op + ll_totalCost <= maxLitPos) {
            /* ll validated; now adjust match length */
            size_t const bytesLeftForMl = (size_t)(maxLitPos - (op+ll_totalCost));
            size_t const maxMlSize = MINMATCH + (ML_MASK-1) + (bytesLeftForMl * 255);
            assert(maxMlSize < INT_MAX); assert(m1.len >= 0);
            if ((size_t)m1.len > maxMlSize) m1.len = (int)maxMlSize;
            if ((oend + LASTLITERALS) - (op + ll_totalCost + 2) - 1 + m1.len >= MFLIMIT) {
                LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor), m1.len, m1.off, notLimited, oend);
        }   }
        goto _last_literals;
    }
    /* compression failed */
    return 0;
}


static int LZ4HC_compress_optimal( LZ4HC_CCtx_internal* ctx,
    const char* const source, char* dst,
    int* srcSizePtr, int dstCapacity,
    int const nbSearches, size_t sufficient_len,
    const limitedOutput_directive limit, int const fullUpdate,
    const dictCtx_directive dict,
    const HCfavor_e favorDecSpeed);

LZ4_FORCE_INLINE int
LZ4HC_compress_generic_internal (
            LZ4HC_CCtx_internal* const ctx,
            const char* const src,
            char* const dst,
            int* const srcSizePtr,
            int const dstCapacity,
            int cLevel,
            const limitedOutput_directive limit,
            const dictCtx_directive dict
            )
{
    DEBUGLOG(5, "LZ4HC_compress_generic_internal(src=%p, srcSize=%d)",
                src, *srcSizePtr);

    if (limit == fillOutput && dstCapacity < 1) return 0;   /* Impossible to store anything */
    if ((U32)*srcSizePtr > (U32)LZ4_MAX_INPUT_SIZE) return 0;  /* Unsupported input size (too large or negative) */

    ctx->end += *srcSizePtr;
    {   cParams_t const cParam = LZ4HC_getCLevelParams(cLevel);
        HCfavor_e const favor = ctx->favorDecSpeed ? favorDecompressionSpeed : favorCompressionRatio;
        int result;

        if (cParam.strat == lz4mid) {
            result = LZ4MID_compress(ctx,
                                src, dst, srcSizePtr, dstCapacity,
                                limit, dict);
        } else if (cParam.strat == lz4hc) {
            result = LZ4HC_compress_hashChain(ctx,
                                src, dst, srcSizePtr, dstCapacity,
                                cParam.nbSearches, limit, dict);
        } else {
            assert(cParam.strat == lz4opt);
            result = LZ4HC_compress_optimal(ctx,
                                src, dst, srcSizePtr, dstCapacity,
                                cParam.nbSearches, cParam.targetLength, limit,
                                cLevel >= LZ4HC_CLEVEL_MAX,   /* ultra mode */
                                dict, favor);
        }
        if (result <= 0) ctx->dirty = 1;
        return result;
    }
}

static void LZ4HC_setExternalDict(LZ4HC_CCtx_internal* ctxPtr, const BYTE* newBlock);

static int
LZ4HC_compress_generic_noDictCtx (
        LZ4HC_CCtx_internal* const ctx,
        const char* const src,
        char* const dst,
        int* const srcSizePtr,
        int const dstCapacity,
        int cLevel,
        limitedOutput_directive limit
        )
{
    assert(ctx->dictCtx == NULL);
    return LZ4HC_compress_generic_internal(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit, noDictCtx);
}

static int isStateCompatible(const LZ4HC_CCtx_internal* ctx1, const LZ4HC_CCtx_internal* ctx2)
{
    int const isMid1 = LZ4HC_getCLevelParams(ctx1->compressionLevel).strat == lz4mid;
    int const isMid2 = LZ4HC_getCLevelParams(ctx2->compressionLevel).strat == lz4mid;
    return !(isMid1 ^ isMid2);
}

static int
LZ4HC_compress_generic_dictCtx (
        LZ4HC_CCtx_internal* const ctx,
        const char* const src,
        char* const dst,
        int* const srcSizePtr,
        int const dstCapacity,
        int cLevel,
        limitedOutput_directive limit
        )
{
    const size_t position = (size_t)(ctx->end - ctx->prefixStart) + (ctx->dictLimit - ctx->lowLimit);
    assert(ctx->dictCtx != NULL);
    if (position >= 64 KB) {
        ctx->dictCtx = NULL;
        return LZ4HC_compress_generic_noDictCtx(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit);
    } else if (position == 0 && *srcSizePtr > 4 KB && isStateCompatible(ctx, ctx->dictCtx)) {
        LZ4_memcpy(ctx, ctx->dictCtx, sizeof(LZ4HC_CCtx_internal));
        LZ4HC_setExternalDict(ctx, (const BYTE *)src);
        ctx->compressionLevel = (short)cLevel;
        return LZ4HC_compress_generic_noDictCtx(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit);
    } else {
        return LZ4HC_compress_generic_internal(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit, usingDictCtxHc);
    }
}

static int
LZ4HC_compress_generic (
        LZ4HC_CCtx_internal* const ctx,
        const char* const src,
        char* const dst,
        int* const srcSizePtr,
        int const dstCapacity,
        int cLevel,
        limitedOutput_directive limit
        )
{
    if (ctx->dictCtx == NULL) {
        return LZ4HC_compress_generic_noDictCtx(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit);
    } else {
        return LZ4HC_compress_generic_dictCtx(ctx, src, dst, srcSizePtr, dstCapacity, cLevel, limit);
    }
}


int LZ4_sizeofStateHC(void) { return (int)sizeof(LZ4_streamHC_t); }

static size_t LZ4_streamHC_t_alignment(void)
{
#if LZ4_ALIGN_TEST
    typedef struct { char c; LZ4_streamHC_t t; } t_a;
    return sizeof(t_a) - sizeof(LZ4_streamHC_t);
#else
    return 1;  /* effectively disabled */
#endif
}

/* state is presumed correctly initialized,
 * in which case its size and alignment have already been validate */
int LZ4_compress_HC_extStateHC_fastReset (void* state, const char* src, char* dst, int srcSize, int dstCapacity, int compressionLevel)
{
    LZ4HC_CCtx_internal* const ctx = &((LZ4_streamHC_t*)state)->internal_donotuse;
    if (!LZ4_isAligned(state, LZ4_streamHC_t_alignment())) return 0;
    LZ4_resetStreamHC_fast((LZ4_streamHC_t*)state, compressionLevel);
    LZ4HC_init_internal (ctx, (const BYTE*)src);
    if (dstCapacity < LZ4_compressBound(srcSize))
        return LZ4HC_compress_generic (ctx, src, dst, &srcSize, dstCapacity, compressionLevel, limitedOutput);
    else
        return LZ4HC_compress_generic (ctx, src, dst, &srcSize, dstCapacity, compressionLevel, notLimited);
}

int LZ4_compress_HC_extStateHC (void* state, const char* src, char* dst, int srcSize, int dstCapacity, int compressionLevel)
{
    LZ4_streamHC_t* const ctx = LZ4_initStreamHC(state, sizeof(*ctx));
    if (ctx==NULL) return 0;   /* init failure */
    return LZ4_compress_HC_extStateHC_fastReset(state, src, dst, srcSize, dstCapacity, compressionLevel);
}

int LZ4_compress_HC(const char* src, char* dst, int srcSize, int dstCapacity, int compressionLevel)
{
    int cSize;
#if defined(LZ4HC_HEAPMODE) && LZ4HC_HEAPMODE==1
    LZ4_streamHC_t* const statePtr = (LZ4_streamHC_t*)ALLOC(sizeof(LZ4_streamHC_t));
    if (statePtr==NULL) return 0;
#else
    LZ4_streamHC_t state;
    LZ4_streamHC_t* const statePtr = &state;
#endif
    DEBUGLOG(5, "LZ4_compress_HC")
    cSize = LZ4_compress_HC_extStateHC(statePtr, src, dst, srcSize, dstCapacity, compressionLevel);
#if defined(LZ4HC_HEAPMODE) && LZ4HC_HEAPMODE==1
    FREEMEM(statePtr);
#endif
    return cSize;
}

/* state is presumed sized correctly (>= sizeof(LZ4_streamHC_t)) */
int LZ4_compress_HC_destSize(void* state, const char* source, char* dest, int* sourceSizePtr, int targetDestSize, int cLevel)
{
    LZ4_streamHC_t* const ctx = LZ4_initStreamHC(state, sizeof(*ctx));
    if (ctx==NULL) return 0;   /* init failure */
    LZ4HC_init_internal(&ctx->internal_donotuse, (const BYTE*) source);
    LZ4_setCompressionLevel(ctx, cLevel);
    return LZ4HC_compress_generic(&ctx->internal_donotuse, source, dest, sourceSizePtr, targetDestSize, cLevel, fillOutput);
}



/**************************************
*  Streaming Functions
**************************************/
/* allocation */
#if !defined(LZ4_STATIC_LINKING_ONLY_DISABLE_MEMORY_ALLOCATION)
LZ4_streamHC_t* LZ4_createStreamHC(void)
{
    LZ4_streamHC_t* const state =
        (LZ4_streamHC_t*)ALLOC_AND_ZERO(sizeof(LZ4_streamHC_t));
    if (state == NULL) return NULL;
    LZ4_setCompressionLevel(state, LZ4HC_CLEVEL_DEFAULT);
    return state;
}

int LZ4_freeStreamHC (LZ4_streamHC_t* LZ4_streamHCPtr)
{
    DEBUGLOG(4, "LZ4_freeStreamHC(%p)", LZ4_streamHCPtr);
    if (!LZ4_streamHCPtr) return 0;  /* support free on NULL */
    FREEMEM(LZ4_streamHCPtr);
    return 0;
}
#endif


LZ4_streamHC_t* LZ4_initStreamHC (void* buffer, size_t size)
{
    LZ4_streamHC_t* const LZ4_streamHCPtr = (LZ4_streamHC_t*)buffer;
    DEBUGLOG(4, "LZ4_initStreamHC(%p, %u)", buffer, (unsigned)size);
    /* check conditions */
    if (buffer == NULL) return NULL;
    if (size < sizeof(LZ4_streamHC_t)) return NULL;
    if (!LZ4_isAligned(buffer, LZ4_streamHC_t_alignment())) return NULL;
    /* init */
    { LZ4HC_CCtx_internal* const hcstate = &(LZ4_streamHCPtr->internal_donotuse);
      MEM_INIT(hcstate, 0, sizeof(*hcstate)); }
    LZ4_setCompressionLevel(LZ4_streamHCPtr, LZ4HC_CLEVEL_DEFAULT);
    return LZ4_streamHCPtr;
}

/* just a stub */
void LZ4_resetStreamHC (LZ4_streamHC_t* LZ4_streamHCPtr, int compressionLevel)
{
    LZ4_initStreamHC(LZ4_streamHCPtr, sizeof(*LZ4_streamHCPtr));
    LZ4_setCompressionLevel(LZ4_streamHCPtr, compressionLevel);
}

void LZ4_resetStreamHC_fast (LZ4_streamHC_t* LZ4_streamHCPtr, int compressionLevel)
{
    LZ4HC_CCtx_internal* const s = &LZ4_streamHCPtr->internal_donotuse;
    DEBUGLOG(5, "LZ4_resetStreamHC_fast(%p, %d)", LZ4_streamHCPtr, compressionLevel);
    if (s->dirty) {
        LZ4_initStreamHC(LZ4_streamHCPtr, sizeof(*LZ4_streamHCPtr));
    } else {
        assert(s->end >= s->prefixStart);
        s->dictLimit += (U32)(s->end - s->prefixStart);
        s->prefixStart = NULL;
        s->end = NULL;
        s->dictCtx = NULL;
    }
    LZ4_setCompressionLevel(LZ4_streamHCPtr, compressionLevel);
}

void LZ4_setCompressionLevel(LZ4_streamHC_t* LZ4_streamHCPtr, int compressionLevel)
{
    DEBUGLOG(5, "LZ4_setCompressionLevel(%p, %d)", LZ4_streamHCPtr, compressionLevel);
    if (compressionLevel < 1) compressionLevel = LZ4HC_CLEVEL_DEFAULT;
    if (compressionLevel > LZ4HC_CLEVEL_MAX) compressionLevel = LZ4HC_CLEVEL_MAX;
    LZ4_streamHCPtr->internal_donotuse.compressionLevel = (short)compressionLevel;
}

void LZ4_favorDecompressionSpeed(LZ4_streamHC_t* LZ4_streamHCPtr, int favor)
{
    LZ4_streamHCPtr->internal_donotuse.favorDecSpeed = (favor!=0);
}

/* LZ4_loadDictHC() :
 * LZ4_streamHCPtr is presumed properly initialized */
int LZ4_loadDictHC (LZ4_streamHC_t* LZ4_streamHCPtr,
              const char* dictionary, int dictSize)
{
    LZ4HC_CCtx_internal* const ctxPtr = &LZ4_streamHCPtr->internal_donotuse;
    cParams_t cp;
    DEBUGLOG(4, "LZ4_loadDictHC(ctx:%p, dict:%p, dictSize:%d, clevel=%d)", LZ4_streamHCPtr, dictionary, dictSize, ctxPtr->compressionLevel);
    assert(dictSize >= 0);
    assert(LZ4_streamHCPtr != NULL);
    if (dictSize > 64 KB) {
        dictionary += (size_t)dictSize - 64 KB;
        dictSize = 64 KB;
    }
    /* need a full initialization, there are bad side-effects when using resetFast() */
    {   int const cLevel = ctxPtr->compressionLevel;
        LZ4_initStreamHC(LZ4_streamHCPtr, sizeof(*LZ4_streamHCPtr));
        LZ4_setCompressionLevel(LZ4_streamHCPtr, cLevel);
        cp = LZ4HC_getCLevelParams(cLevel);
    }
    LZ4HC_init_internal (ctxPtr, (const BYTE*)dictionary);
    ctxPtr->end = (const BYTE*)dictionary + dictSize;
    if (cp.strat == lz4mid) {
        LZ4MID_fillHTable (ctxPtr, dictionary, (size_t)dictSize);
    } else {
        if (dictSize >= LZ4HC_HASHSIZE) LZ4HC_Insert (ctxPtr, ctxPtr->end-3);
    }
    return dictSize;
}

void LZ4_attach_HC_dictionary(LZ4_streamHC_t *working_stream, const LZ4_streamHC_t *dictionary_stream) {
    working_stream->internal_donotuse.dictCtx = dictionary_stream != NULL ? &(dictionary_stream->internal_donotuse) : NULL;
}

/* compression */

static void LZ4HC_setExternalDict(LZ4HC_CCtx_internal* ctxPtr, const BYTE* newBlock)
{
    DEBUGLOG(4, "LZ4HC_setExternalDict(%p, %p)", ctxPtr, newBlock);
    if ( (ctxPtr->end >= ctxPtr->prefixStart + 4)
      && (LZ4HC_getCLevelParams(ctxPtr->compressionLevel).strat != lz4mid) ) {
        LZ4HC_Insert (ctxPtr, ctxPtr->end-3);  /* Referencing remaining dictionary content */
    }

    /* Only one memory segment for extDict, so any previous extDict is lost at this stage */
    ctxPtr->lowLimit  = ctxPtr->dictLimit;
    ctxPtr->dictStart  = ctxPtr->prefixStart;
    ctxPtr->dictLimit += (U32)(ctxPtr->end - ctxPtr->prefixStart);
    ctxPtr->prefixStart = newBlock;
    ctxPtr->end  = newBlock;
    ctxPtr->nextToUpdate = ctxPtr->dictLimit;   /* match referencing will resume from there */

    /* cannot reference an extDict and a dictCtx at the same time */
    ctxPtr->dictCtx = NULL;
}

static int
LZ4_compressHC_continue_generic (LZ4_streamHC_t* LZ4_streamHCPtr,
                                 const char* src, char* dst,
                                 int* srcSizePtr, int dstCapacity,
                                 limitedOutput_directive limit)
{
    LZ4HC_CCtx_internal* const ctxPtr = &LZ4_streamHCPtr->internal_donotuse;
    DEBUGLOG(5, "LZ4_compressHC_continue_generic(ctx=%p, src=%p, srcSize=%d, limit=%d)",
                LZ4_streamHCPtr, src, *srcSizePtr, limit);
    assert(ctxPtr != NULL);
    /* auto-init if forgotten */
    if (ctxPtr->prefixStart == NULL)
        LZ4HC_init_internal (ctxPtr, (const BYTE*) src);

    /* Check overflow */
    if ((size_t)(ctxPtr->end - ctxPtr->prefixStart) + ctxPtr->dictLimit > 2 GB) {
        size_t dictSize = (size_t)(ctxPtr->end - ctxPtr->prefixStart);
        if (dictSize > 64 KB) dictSize = 64 KB;
        LZ4_loadDictHC(LZ4_streamHCPtr, (const char*)(ctxPtr->end) - dictSize, (int)dictSize);
    }

    /* Check if blocks follow each other */
    if ((const BYTE*)src != ctxPtr->end)
        LZ4HC_setExternalDict(ctxPtr, (const BYTE*)src);

    /* Check overlapping input/dictionary space */
    {   const BYTE* sourceEnd = (const BYTE*) src + *srcSizePtr;
        const BYTE* const dictBegin = ctxPtr->dictStart;
        const BYTE* const dictEnd   = ctxPtr->dictStart + (ctxPtr->dictLimit - ctxPtr->lowLimit);
        if ((sourceEnd > dictBegin) && ((const BYTE*)src < dictEnd)) {
            if (sourceEnd > dictEnd) sourceEnd = dictEnd;
            ctxPtr->lowLimit += (U32)(sourceEnd - ctxPtr->dictStart);
            ctxPtr->dictStart += (U32)(sourceEnd - ctxPtr->dictStart);
            /* invalidate dictionary is it's too small */
            if (ctxPtr->dictLimit - ctxPtr->lowLimit < LZ4HC_HASHSIZE) {
                ctxPtr->lowLimit = ctxPtr->dictLimit;
                ctxPtr->dictStart = ctxPtr->prefixStart;
    }   }   }

    return LZ4HC_compress_generic (ctxPtr, src, dst, srcSizePtr, dstCapacity, ctxPtr->compressionLevel, limit);
}

int LZ4_compress_HC_continue (LZ4_streamHC_t* LZ4_streamHCPtr, const char* src, char* dst, int srcSize, int dstCapacity)
{
    DEBUGLOG(5, "LZ4_compress_HC_continue");
    if (dstCapacity < LZ4_compressBound(srcSize))
        return LZ4_compressHC_continue_generic (LZ4_streamHCPtr, src, dst, &srcSize, dstCapacity, limitedOutput);
    else
        return LZ4_compressHC_continue_generic (LZ4_streamHCPtr, src, dst, &srcSize, dstCapacity, notLimited);
}

int LZ4_compress_HC_continue_destSize (LZ4_streamHC_t* LZ4_streamHCPtr, const char* src, char* dst, int* srcSizePtr, int targetDestSize)
{
    return LZ4_compressHC_continue_generic(LZ4_streamHCPtr, src, dst, srcSizePtr, targetDestSize, fillOutput);
}


/* LZ4_saveDictHC :
 * save history content
 * into a user-provided buffer
 * which is then used to continue compression
 */
int LZ4_saveDictHC (LZ4_streamHC_t* LZ4_streamHCPtr, char* safeBuffer, int dictSize)
{
    LZ4HC_CCtx_internal* const streamPtr = &LZ4_streamHCPtr->internal_donotuse;
    int const prefixSize = (int)(streamPtr->end - streamPtr->prefixStart);
    DEBUGLOG(5, "LZ4_saveDictHC(%p, %p, %d)", LZ4_streamHCPtr, safeBuffer, dictSize);
    assert(prefixSize >= 0);
    if (dictSize > 64 KB) dictSize = 64 KB;
    if (dictSize < 4) dictSize = 0;
    if (dictSize > prefixSize) dictSize = prefixSize;
    if (safeBuffer == NULL) assert(dictSize == 0);
    if (dictSize > 0)
        LZ4_memmove(safeBuffer, streamPtr->end - dictSize, (size_t)dictSize);
    {   U32 const endIndex = (U32)(streamPtr->end - streamPtr->prefixStart) + streamPtr->dictLimit;
        streamPtr->end = (safeBuffer == NULL) ? NULL : (const BYTE*)safeBuffer + dictSize;
        streamPtr->prefixStart = (const BYTE*)safeBuffer;
        streamPtr->dictLimit = endIndex - (U32)dictSize;
        streamPtr->lowLimit = endIndex - (U32)dictSize;
        streamPtr->dictStart = streamPtr->prefixStart;
        if (streamPtr->nextToUpdate < streamPtr->dictLimit)
            streamPtr->nextToUpdate = streamPtr->dictLimit;
    }
    return dictSize;
}


/* ================================================
 *  LZ4 Optimal parser (levels [LZ4HC_CLEVEL_OPT_MIN - LZ4HC_CLEVEL_MAX])
 * ===============================================*/
typedef struct {
    int price;
    int off;
    int mlen;
    int litlen;
} LZ4HC_optimal_t;

/* price in bytes */
LZ4_FORCE_INLINE int LZ4HC_literalsPrice(int const litlen)
{
    int price = litlen;
    assert(litlen >= 0);
    if (litlen >= (int)RUN_MASK)
        price += 1 + ((litlen-(int)RUN_MASK) / 255);
    return price;
}

/* requires mlen >= MINMATCH */
LZ4_FORCE_INLINE int LZ4HC_sequencePrice(int litlen, int mlen)
{
    int price = 1 + 2 ; /* token + 16-bit offset */
    assert(litlen >= 0);
    assert(mlen >= MINMATCH);

    price += LZ4HC_literalsPrice(litlen);

    if (mlen >= (int)(ML_MASK+MINMATCH))
        price += 1 + ((mlen-(int)(ML_MASK+MINMATCH)) / 255);

    return price;
}

LZ4_FORCE_INLINE LZ4HC_match_t
LZ4HC_FindLongerMatch(LZ4HC_CCtx_internal* const ctx,
                      const BYTE* ip, const BYTE* const iHighLimit,
                      int minLen, int nbSearches,
                      const dictCtx_directive dict,
                      const HCfavor_e favorDecSpeed)
{
    LZ4HC_match_t const match0 = { 0 , 0, 0 };
    /* note : LZ4HC_InsertAndGetWiderMatch() is able to modify the starting position of a match (*startpos),
     * but this won't be the case here, as we define iLowLimit==ip,
    ** so LZ4HC_InsertAndGetWiderMatch() won't be allowed to search past ip */
    LZ4HC_match_t md = LZ4HC_InsertAndGetWiderMatch(ctx, ip, ip, iHighLimit, minLen, nbSearches, 1 /*patternAnalysis*/, 1 /*chainSwap*/, dict, favorDecSpeed);
    assert(md.back == 0);
    if (md.len <= minLen) return match0;
    if (favorDecSpeed) {
        if ((md.len>18) & (md.len<=36)) md.len=18;   /* favor dec.speed (shortcut) */
    }
    return md;
}


static int LZ4HC_compress_optimal ( LZ4HC_CCtx_internal* ctx,
                                    const char* const source,
                                    char* dst,
                                    int* srcSizePtr,
                                    int dstCapacity,
                                    int const nbSearches,
                                    size_t sufficient_len,
                                    const limitedOutput_directive limit,
                                    int const fullUpdate,
                                    const dictCtx_directive dict,
                                    const HCfavor_e favorDecSpeed)
{
    int retval = 0;
#define TRAILING_LITERALS 3
#if defined(LZ4HC_HEAPMODE) && LZ4HC_HEAPMODE==1
    LZ4HC_optimal_t* const opt = (LZ4HC_optimal_t*)ALLOC(sizeof(LZ4HC_optimal_t) * (LZ4_OPT_NUM + TRAILING_LITERALS));
#else
    LZ4HC_optimal_t opt[LZ4_OPT_NUM + TRAILING_LITERALS];   /* ~64 KB, which is a bit large for stack... */
#endif

    const BYTE* ip = (const BYTE*) source;
    const BYTE* anchor = ip;
    const BYTE* const iend = ip + *srcSizePtr;
    const BYTE* const mflimit = iend - MFLIMIT;
    const BYTE* const matchlimit = iend - LASTLITERALS;
    BYTE* op = (BYTE*) dst;
    BYTE* opSaved = (BYTE*) dst;
    BYTE* oend = op + dstCapacity;
    int ovml = MINMATCH;  /* overflow - last sequence */
    int ovoff = 0;

    /* init */
#if defined(LZ4HC_HEAPMODE) && LZ4HC_HEAPMODE==1
    if (opt == NULL) goto _return_label;
#endif
    DEBUGLOG(5, "LZ4HC_compress_optimal(dst=%p, dstCapa=%u)", dst, (unsigned)dstCapacity);
    *srcSizePtr = 0;
    if (limit == fillOutput) oend -= LASTLITERALS;   /* Hack for support LZ4 format restriction */
    if (sufficient_len >= LZ4_OPT_NUM) sufficient_len = LZ4_OPT_NUM-1;

    /* Main Loop */
    while (ip <= mflimit) {
         int const llen = (int)(ip - anchor);
         int best_mlen, best_off;
         int cur, last_match_pos = 0;

         LZ4HC_match_t const firstMatch = LZ4HC_FindLongerMatch(ctx, ip, matchlimit, MINMATCH-1, nbSearches, dict, favorDecSpeed);
         if (firstMatch.len==0) { ip++; continue; }

         if ((size_t)firstMatch.len > sufficient_len) {
             /* good enough solution : immediate encoding */
             int const firstML = firstMatch.len;
             opSaved = op;
             if ( LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor), firstML, firstMatch.off, limit, oend) ) {  /* updates ip, op and anchor */
                 ovml = firstML;
                 ovoff = firstMatch.off;
                 goto _dest_overflow;
             }
             continue;
         }

         /* set prices for first positions (literals) */
         {   int rPos;
             for (rPos = 0 ; rPos < MINMATCH ; rPos++) {
                 int const cost = LZ4HC_literalsPrice(llen + rPos);
                 opt[rPos].mlen = 1;
                 opt[rPos].off = 0;
                 opt[rPos].litlen = llen + rPos;
                 opt[rPos].price = cost;
                 DEBUGLOG(7, "rPos:%3i => price:%3i (litlen=%i) -- initial setup",
                             rPos, cost, opt[rPos].litlen);
         }   }
         /* set prices using initial match */
         {   int const matchML = firstMatch.len;   /* necessarily < sufficient_len < LZ4_OPT_NUM */
             int const offset = firstMatch.off;
             int mlen;
             assert(matchML < LZ4_OPT_NUM);
             for (mlen = MINMATCH ; mlen <= matchML ; mlen++) {
                 int const cost = LZ4HC_sequencePrice(llen, mlen);
                 opt[mlen].mlen = mlen;
                 opt[mlen].off = offset;
                 opt[mlen].litlen = llen;
                 opt[mlen].price = cost;
                 DEBUGLOG(7, "rPos:%3i => price:%3i (matchlen=%i) -- initial setup",
                             mlen, cost, mlen);
         }   }
         last_match_pos = firstMatch.len;
         {   int addLit;
             for (addLit = 1; addLit <= TRAILING_LITERALS; addLit ++) {
                 opt[last_match_pos+addLit].mlen = 1; /* literal */
                 opt[last_match_pos+addLit].off = 0;
                 opt[last_match_pos+addLit].litlen = addLit;
                 opt[last_match_pos+addLit].price = opt[last_match_pos].price + LZ4HC_literalsPrice(addLit);
                 DEBUGLOG(7, "rPos:%3i => price:%3i (litlen=%i) -- initial setup",
                             last_match_pos+addLit, opt[last_match_pos+addLit].price, addLit);
         }   }

         /* check further positions */
         for (cur = 1; cur < last_match_pos; cur++) {
             const BYTE* const curPtr = ip + cur;
             LZ4HC_match_t newMatch;

             if (curPtr > mflimit) break;
             DEBUGLOG(7, "rPos:%u[%u] vs [%u]%u",
                     cur, opt[cur].price, opt[cur+1].price, cur+1);
             if (fullUpdate) {
                 /* not useful to search here if next position has same (or lower) cost */
                 if ( (opt[cur+1].price <= opt[cur].price)
                   /* in some cases, next position has same cost, but cost rises sharply after, so a small match would still be beneficial */
                   && (opt[cur+MINMATCH].price < opt[cur].price + 3/*min seq price*/) )
                     continue;
             } else {
                 /* not useful to search here if next position has same (or lower) cost */
                 if (opt[cur+1].price <= opt[cur].price) continue;
             }

             DEBUGLOG(7, "search at rPos:%u", cur);
             if (fullUpdate)
                 newMatch = LZ4HC_FindLongerMatch(ctx, curPtr, matchlimit, MINMATCH-1, nbSearches, dict, favorDecSpeed);
             else
                 /* only test matches of minimum length; slightly faster, but misses a few bytes */
                 newMatch = LZ4HC_FindLongerMatch(ctx, curPtr, matchlimit, last_match_pos - cur, nbSearches, dict, favorDecSpeed);
             if (!newMatch.len) continue;

             if ( ((size_t)newMatch.len > sufficient_len)
               || (newMatch.len + cur >= LZ4_OPT_NUM) ) {
                 /* immediate encoding */
                 best_mlen = newMatch.len;
                 best_off = newMatch.off;
                 last_match_pos = cur + 1;
                 goto encode;
             }

             /* before match : set price with literals at beginning */
             {   int const baseLitlen = opt[cur].litlen;
                 int litlen;
                 for (litlen = 1; litlen < MINMATCH; litlen++) {
                     int const price = opt[cur].price - LZ4HC_literalsPrice(baseLitlen) + LZ4HC_literalsPrice(baseLitlen+litlen);
                     int const pos = cur + litlen;
                     if (price < opt[pos].price) {
                         opt[pos].mlen = 1; /* literal */
                         opt[pos].off = 0;
                         opt[pos].litlen = baseLitlen+litlen;
                         opt[pos].price = price;
                         DEBUGLOG(7, "rPos:%3i => price:%3i (litlen=%i)",
                                     pos, price, opt[pos].litlen);
             }   }   }

             /* set prices using match at position = cur */
             {   int const matchML = newMatch.len;
                 int ml = MINMATCH;

                 assert(cur + newMatch.len < LZ4_OPT_NUM);
                 for ( ; ml <= matchML ; ml++) {
                     int const pos = cur + ml;
                     int const offset = newMatch.off;
                     int price;
                     int ll;
                     DEBUGLOG(7, "testing price rPos %i (last_match_pos=%i)",
                                 pos, last_match_pos);
                     if (opt[cur].mlen == 1) {
                         ll = opt[cur].litlen;
                         price = ((cur > ll) ? opt[cur - ll].price : 0)
                               + LZ4HC_sequencePrice(ll, ml);
                     } else {
                         ll = 0;
                         price = opt[cur].price + LZ4HC_sequencePrice(0, ml);
                     }

                    assert((U32)favorDecSpeed <= 1);
                     if (pos > last_match_pos+TRAILING_LITERALS
                      || price <= opt[pos].price - (int)favorDecSpeed) {
                         DEBUGLOG(7, "rPos:%3i => price:%3i (matchlen=%i)",
                                     pos, price, ml);
                         assert(pos < LZ4_OPT_NUM);
                         if ( (ml == matchML)  /* last pos of last match */
                           && (last_match_pos < pos) )
                             last_match_pos = pos;
                         opt[pos].mlen = ml;
                         opt[pos].off = offset;
                         opt[pos].litlen = ll;
                         opt[pos].price = price;
             }   }   }
             /* complete following positions with literals */
             {   int addLit;
                 for (addLit = 1; addLit <= TRAILING_LITERALS; addLit ++) {
                     opt[last_match_pos+addLit].mlen = 1; /* literal */
                     opt[last_match_pos+addLit].off = 0;
                     opt[last_match_pos+addLit].litlen = addLit;
                     opt[last_match_pos+addLit].price = opt[last_match_pos].price + LZ4HC_literalsPrice(addLit);
                     DEBUGLOG(7, "rPos:%3i => price:%3i (litlen=%i)", last_match_pos+addLit, opt[last_match_pos+addLit].price, addLit);
             }   }
         }  /* for (cur = 1; cur <= last_match_pos; cur++) */

         assert(last_match_pos < LZ4_OPT_NUM + TRAILING_LITERALS);
         best_mlen = opt[last_match_pos].mlen;
         best_off = opt[last_match_pos].off;
         cur = last_match_pos - best_mlen;

encode: /* cur, last_match_pos, best_mlen, best_off must be set */
         assert(cur < LZ4_OPT_NUM);
         assert(last_match_pos >= 1);  /* == 1 when only one candidate */
         DEBUGLOG(6, "reverse traversal, looking for shortest path (last_match_pos=%i)", last_match_pos);
         {   int candidate_pos = cur;
             int selected_matchLength = best_mlen;
             int selected_offset = best_off;
             while (1) {  /* from end to beginning */
                 int const next_matchLength = opt[candidate_pos].mlen;  /* can be 1, means literal */
                 int const next_offset = opt[candidate_pos].off;
                 DEBUGLOG(7, "pos %i: sequence length %i", candidate_pos, selected_matchLength);
                 opt[candidate_pos].mlen = selected_matchLength;
                 opt[candidate_pos].off = selected_offset;
                 selected_matchLength = next_matchLength;
                 selected_offset = next_offset;
                 if (next_matchLength > candidate_pos) break; /* last match elected, first match to encode */
                 assert(next_matchLength > 0);  /* can be 1, means literal */
                 candidate_pos -= next_matchLength;
         }   }

         /* encode all recorded sequences in order */
         {   int rPos = 0;  /* relative position (to ip) */
             while (rPos < last_match_pos) {
                 int const ml = opt[rPos].mlen;
                 int const offset = opt[rPos].off;
                 if (ml == 1) { ip++; rPos++; continue; }  /* literal; note: can end up with several literals, in which case, skip them */
                 rPos += ml;
                 assert(ml >= MINMATCH);
                 assert((offset >= 1) && (offset <= LZ4_DISTANCE_MAX));
                 opSaved = op;
                 if ( LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor), ml, offset, limit, oend) ) {  /* updates ip, op and anchor */
                     ovml = ml;
                     ovoff = offset;
                     goto _dest_overflow;
         }   }   }
     }  /* while (ip <= mflimit) */

_last_literals:
     /* Encode Last Literals */
     {   size_t lastRunSize = (size_t)(iend - anchor);  /* literals */
         size_t llAdd = (lastRunSize + 255 - RUN_MASK) / 255;
         size_t const totalSize = 1 + llAdd + lastRunSize;
         if (limit == fillOutput) oend += LASTLITERALS;  /* restore correct value */
         if (limit && (op + totalSize > oend)) {
             if (limit == limitedOutput) { /* Check output limit */
                retval = 0;
                goto _return_label;
             }
             /* adapt lastRunSize to fill 'dst' */
             lastRunSize  = (size_t)(oend - op) - 1 /*token*/;
             llAdd = (lastRunSize + 256 - RUN_MASK) / 256;
             lastRunSize -= llAdd;
         }
         DEBUGLOG(6, "Final literal run : %i literals", (int)lastRunSize);
         ip = anchor + lastRunSize; /* can be != iend if limit==fillOutput */

         if (lastRunSize >= RUN_MASK) {
             size_t accumulator = lastRunSize - RUN_MASK;
             *op++ = (RUN_MASK << ML_BITS);
             for(; accumulator >= 255 ; accumulator -= 255) *op++ = 255;
             *op++ = (BYTE) accumulator;
         } else {
             *op++ = (BYTE)(lastRunSize << ML_BITS);
         }
         LZ4_memcpy(op, anchor, lastRunSize);
         op += lastRunSize;
     }

     /* End */
     *srcSizePtr = (int) (((const char*)ip) - source);
     retval = (int) ((char*)op-dst);
     goto _return_label;

_dest_overflow:
if (limit == fillOutput) {
     /* Assumption : ip, anchor, ovml and ovref must be set correctly */
     size_t const ll = (size_t)(ip - anchor);
     size_t const ll_addbytes = (ll + 240) / 255;
     size_t const ll_totalCost = 1 + ll_addbytes + ll;
     BYTE* const maxLitPos = oend - 3; /* 2 for offset, 1 for token */
     DEBUGLOG(6, "Last sequence overflowing (only %i bytes remaining)", (int)(oend-1-opSaved));
     op = opSaved;  /* restore correct out pointer */
     if (op + ll_totalCost <= maxLitPos) {
         /* ll validated; now adjust match length */
         size_t const bytesLeftForMl = (size_t)(maxLitPos - (op+ll_totalCost));
         size_t const maxMlSize = MINMATCH + (ML_MASK-1) + (bytesLeftForMl * 255);
         assert(maxMlSize < INT_MAX); assert(ovml >= 0);
         if ((size_t)ovml > maxMlSize) ovml = (int)maxMlSize;
         if ((oend + LASTLITERALS) - (op + ll_totalCost + 2) - 1 + ovml >= MFLIMIT) {
             DEBUGLOG(6, "Space to end : %i + ml (%i)", (int)((oend + LASTLITERALS) - (op + ll_totalCost + 2) - 1), ovml);
             DEBUGLOG(6, "Before : ip = %p, anchor = %p", ip, anchor);
             LZ4HC_encodeSequence(UPDATABLE(ip, op, anchor), ovml, ovoff, notLimited, oend);
             DEBUGLOG(6, "After : ip = %p, anchor = %p", ip, anchor);
     }   }
     goto _last_literals;
}
_return_label:
#if defined(LZ4HC_HEAPMODE) && LZ4HC_HEAPMODE==1
     if (opt) FREEMEM(opt);
#endif
     return retval;
}


/***************************************************
*  Deprecated Functions
***************************************************/

/* These functions currently generate deprecation warnings */

/* Wrappers for deprecated compression functions */
int LZ4_compressHC(const char* src, char* dst, int srcSize) { return LZ4_compress_HC (src, dst, srcSize, LZ4_compressBound(srcSize), 0); }
int LZ4_compressHC_limitedOutput(const char* src, char* dst, int srcSize, int maxDstSize) { return LZ4_compress_HC(src, dst, srcSize, maxDstSize, 0); }
int LZ4_compressHC2(const char* src, char* dst, int srcSize, int cLevel) { return LZ4_compress_HC (src, dst, srcSize, LZ4_compressBound(srcSize), cLevel); }
int LZ4_compressHC2_limitedOutput(const char* src, char* dst, int srcSize, int maxDstSize, int cLevel) { return LZ4_compress_HC(src, dst, srcSize, maxDstSize, cLevel); }
int LZ4_compressHC_withStateHC (void* state, const char* src, char* dst, int srcSize) { return LZ4_compress_HC_extStateHC (state, src, dst, srcSize, LZ4_compressBound(srcSize), 0); }
int LZ4_compressHC_limitedOutput_withStateHC (void* state, const char* src, char* dst, int srcSize, int maxDstSize) { return LZ4_compress_HC_extStateHC (state, src, dst, srcSize, maxDstSize, 0); }
int LZ4_compressHC2_withStateHC (void* state, const char* src, char* dst, int srcSize, int cLevel) { return LZ4_compress_HC_extStateHC(state, src, dst, srcSize, LZ4_compressBound(srcSize), cLevel); }
int LZ4_compressHC2_limitedOutput_withStateHC (void* state, const char* src, char* dst, int srcSize, int maxDstSize, int cLevel) { return LZ4_compress_HC_extStateHC(state, src, dst, srcSize, maxDstSize, cLevel); }
int LZ4_compressHC_continue (LZ4_streamHC_t* ctx, const char* src, char* dst, int srcSize) { return LZ4_compress_HC_continue (ctx, src, dst, srcSize, LZ4_compressBound(srcSize)); }
int LZ4_compressHC_limitedOutput_continue (LZ4_streamHC_t* ctx, const char* src, char* dst, int srcSize, int maxDstSize) { return LZ4_compress_HC_continue (ctx, src, dst, srcSize, maxDstSize); }


/* Deprecated streaming functions */
int LZ4_sizeofStreamStateHC(void) { return sizeof(LZ4_streamHC_t); }

/* state is presumed correctly sized, aka >= sizeof(LZ4_streamHC_t)
 * @return : 0 on success, !=0 if error */
int LZ4_resetStreamStateHC(void* state, char* inputBuffer)
{
    LZ4_streamHC_t* const hc4 = LZ4_initStreamHC(state, sizeof(*hc4));
    if (hc4 == NULL) return 1;   /* init failed */
    LZ4HC_init_internal (&hc4->internal_donotuse, (const BYTE*)inputBuffer);
    return 0;
}

#if !defined(LZ4_STATIC_LINKING_ONLY_DISABLE_MEMORY_ALLOCATION)
void* LZ4_createHC (const char* inputBuffer)
{
    LZ4_streamHC_t* const hc4 = LZ4_createStreamHC();
    if (hc4 == NULL) return NULL;   /* not enough memory */
    LZ4HC_init_internal (&hc4->internal_donotuse, (const BYTE*)inputBuffer);
    return hc4;
}

int LZ4_freeHC (void* LZ4HC_Data)
{
    if (!LZ4HC_Data) return 0;  /* support free on NULL */
    FREEMEM(LZ4HC_Data);
    return 0;
}
#endif

int LZ4_compressHC2_continue (void* LZ4HC_Data, const char* src, char* dst, int srcSize, int cLevel)
{
    return LZ4HC_compress_generic (&((LZ4_streamHC_t*)LZ4HC_Data)->internal_donotuse, src, dst, &srcSize, 0, cLevel, notLimited);
}

int LZ4_compressHC2_limitedOutput_continue (void* LZ4HC_Data, const char* src, char* dst, int srcSize, int dstCapacity, int cLevel)
{
    return LZ4HC_compress_generic (&((LZ4_streamHC_t*)LZ4HC_Data)->internal_donotuse, src, dst, &srcSize, dstCapacity, cLevel, limitedOutput);
}

char* LZ4_slideInputBufferHC(void* LZ4HC_Data)
{
    LZ4HC_CCtx_internal* const s = &((LZ4_streamHC_t*)LZ4HC_Data)->internal_donotuse;
    const BYTE* const bufferStart = s->prefixStart - s->dictLimit + s->lowLimit;
    LZ4_resetStreamHC_fast((LZ4_streamHC_t*)LZ4HC_Data, s->compressionLevel);
    /* ugly conversion trick, required to evade (const char*) -> (char*) cast-qual warning :( */
    return (char*)(uptrval)bufferStart;
}
