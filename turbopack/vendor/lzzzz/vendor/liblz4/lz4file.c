/*
 * LZ4 file library
 * Copyright (C) 2022, Xiaomi Inc.
 *
 * BSD 2-Clause License (http://www.opensource.org/licenses/bsd-license.php)
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are
 * met:
 *
 * - Redistributions of source code must retain the above copyright
 *   notice, this list of conditions and the following disclaimer.
 * - Redistributions in binary form must reproduce the above
 *   copyright notice, this list of conditions and the following disclaimer
 *   in the documentation and/or other materials provided with the
 *   distribution.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS
 * "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT
 * LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR
 * A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT
 * OWNER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL,
 * SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
 * LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY
 * THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
 * (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE
 * OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 *
 * You can contact the author at :
 * - LZ4 homepage : http://www.lz4.org
 * - LZ4 source repository : https://github.com/lz4/lz4
 */
#include <stdlib.h>  /* malloc, free */
#include <string.h>
#include <assert.h>
#include "lz4.h"
#include "lz4file.h"

static LZ4F_errorCode_t returnErrorCode(LZ4F_errorCodes code)
{
    return (LZ4F_errorCode_t)-(ptrdiff_t)code;
}
#undef RETURN_ERROR
#define RETURN_ERROR(e) return returnErrorCode(LZ4F_ERROR_ ## e)

/* =====   read API   ===== */

struct LZ4_readFile_s {
  LZ4F_dctx* dctxPtr;
  FILE* fp;
  LZ4_byte* srcBuf;
  size_t srcBufNext;
  size_t srcBufSize;
  size_t srcBufMaxSize;
};

static void LZ4F_freeReadFile(LZ4_readFile_t* lz4fRead)
{
  if (lz4fRead==NULL) return;
  LZ4F_freeDecompressionContext(lz4fRead->dctxPtr);
  free(lz4fRead->srcBuf);
  free(lz4fRead);
}

static void LZ4F_freeAndNullReadFile(LZ4_readFile_t** statePtr)
{
  assert(statePtr != NULL);
  LZ4F_freeReadFile(*statePtr);
  *statePtr = NULL;
}

LZ4F_errorCode_t LZ4F_readOpen(LZ4_readFile_t** lz4fRead, FILE* fp)
{
  char buf[LZ4F_HEADER_SIZE_MAX];
  size_t consumedSize;
  LZ4F_errorCode_t ret;

  if (fp == NULL || lz4fRead == NULL) {
    RETURN_ERROR(parameter_null);
  }

  *lz4fRead = (LZ4_readFile_t*)calloc(1, sizeof(LZ4_readFile_t));
  if (*lz4fRead == NULL) {
    RETURN_ERROR(allocation_failed);
  }

  ret = LZ4F_createDecompressionContext(&(*lz4fRead)->dctxPtr, LZ4F_VERSION);
  if (LZ4F_isError(ret)) {
    LZ4F_freeAndNullReadFile(lz4fRead);
    return ret;
  }

  (*lz4fRead)->fp = fp;
  consumedSize = fread(buf, 1, sizeof(buf), (*lz4fRead)->fp);
  if (consumedSize != sizeof(buf)) {
    LZ4F_freeAndNullReadFile(lz4fRead);
    RETURN_ERROR(io_read);
  }

  { LZ4F_frameInfo_t info;
    LZ4F_errorCode_t const r = LZ4F_getFrameInfo((*lz4fRead)->dctxPtr, &info, buf, &consumedSize);
    if (LZ4F_isError(r)) {
      LZ4F_freeAndNullReadFile(lz4fRead);
      return r;
    }

    switch (info.blockSizeID) {
      case LZ4F_default :
      case LZ4F_max64KB :
        (*lz4fRead)->srcBufMaxSize = 64 * 1024;
        break;
      case LZ4F_max256KB:
        (*lz4fRead)->srcBufMaxSize = 256 * 1024;
        break;
      case LZ4F_max1MB:
        (*lz4fRead)->srcBufMaxSize = 1 * 1024 * 1024;
        break;
      case LZ4F_max4MB:
        (*lz4fRead)->srcBufMaxSize = 4 * 1024 * 1024;
        break;
      default:
        LZ4F_freeAndNullReadFile(lz4fRead);
        RETURN_ERROR(maxBlockSize_invalid);
    }
  }

  (*lz4fRead)->srcBuf = (LZ4_byte*)malloc((*lz4fRead)->srcBufMaxSize);
  if ((*lz4fRead)->srcBuf == NULL) {
    LZ4F_freeAndNullReadFile(lz4fRead);
    RETURN_ERROR(allocation_failed);
  }

  (*lz4fRead)->srcBufSize = sizeof(buf) - consumedSize;
  memcpy((*lz4fRead)->srcBuf, buf + consumedSize, (*lz4fRead)->srcBufSize);

  return ret;
}

size_t LZ4F_read(LZ4_readFile_t* lz4fRead, void* buf, size_t size)
{
  LZ4_byte* p = (LZ4_byte*)buf;
  size_t next = 0;

  if (lz4fRead == NULL || buf == NULL)
    RETURN_ERROR(parameter_null);

  while (next < size) {
    size_t srcsize = lz4fRead->srcBufSize - lz4fRead->srcBufNext;
    size_t dstsize = size - next;
    size_t ret;

    if (srcsize == 0) {
      ret = fread(lz4fRead->srcBuf, 1, lz4fRead->srcBufMaxSize, lz4fRead->fp);
      if (ret > 0) {
        lz4fRead->srcBufSize = ret;
        srcsize = lz4fRead->srcBufSize;
        lz4fRead->srcBufNext = 0;
      } else if (ret == 0) {
        break;
      } else {
        RETURN_ERROR(io_read);
      }
    }

    ret = LZ4F_decompress(lz4fRead->dctxPtr,
                          p, &dstsize,
                          lz4fRead->srcBuf + lz4fRead->srcBufNext,
                          &srcsize,
                          NULL);
    if (LZ4F_isError(ret)) {
        return ret;
    }

    lz4fRead->srcBufNext += srcsize;
    next += dstsize;
    p += dstsize;
  }

  return next;
}

LZ4F_errorCode_t LZ4F_readClose(LZ4_readFile_t* lz4fRead)
{
  if (lz4fRead == NULL)
    RETURN_ERROR(parameter_null);
  LZ4F_freeReadFile(lz4fRead);
  return LZ4F_OK_NoError;
}

/* =====   write API   ===== */

struct LZ4_writeFile_s {
  LZ4F_cctx* cctxPtr;
  FILE* fp;
  LZ4_byte* dstBuf;
  size_t maxWriteSize;
  size_t dstBufMaxSize;
  LZ4F_errorCode_t errCode;
};

static void LZ4F_freeWriteFile(LZ4_writeFile_t* state)
{
  if (state == NULL) return;
  LZ4F_freeCompressionContext(state->cctxPtr);
  free(state->dstBuf);
  free(state);
}

static void LZ4F_freeAndNullWriteFile(LZ4_writeFile_t** statePtr)
{
  assert(statePtr != NULL);
  LZ4F_freeWriteFile(*statePtr);
  *statePtr = NULL;
}

LZ4F_errorCode_t LZ4F_writeOpen(LZ4_writeFile_t** lz4fWrite, FILE* fp, const LZ4F_preferences_t* prefsPtr)
{
  LZ4_byte buf[LZ4F_HEADER_SIZE_MAX];
  size_t ret;

  if (fp == NULL || lz4fWrite == NULL)
    RETURN_ERROR(parameter_null);

  *lz4fWrite = (LZ4_writeFile_t*)calloc(1, sizeof(LZ4_writeFile_t));
  if (*lz4fWrite == NULL) {
    RETURN_ERROR(allocation_failed);
  }
  if (prefsPtr != NULL) {
    switch (prefsPtr->frameInfo.blockSizeID) {
      case LZ4F_default :
      case LZ4F_max64KB :
        (*lz4fWrite)->maxWriteSize = 64 * 1024;
        break;
      case LZ4F_max256KB:
        (*lz4fWrite)->maxWriteSize = 256 * 1024;
        break;
      case LZ4F_max1MB:
        (*lz4fWrite)->maxWriteSize = 1 * 1024 * 1024;
        break;
      case LZ4F_max4MB:
        (*lz4fWrite)->maxWriteSize = 4 * 1024 * 1024;
        break;
      default:
        LZ4F_freeAndNullWriteFile(lz4fWrite);
        RETURN_ERROR(maxBlockSize_invalid);
      }
    } else {
      (*lz4fWrite)->maxWriteSize = 64 * 1024;
    }

  (*lz4fWrite)->dstBufMaxSize = LZ4F_compressBound((*lz4fWrite)->maxWriteSize, prefsPtr);
  (*lz4fWrite)->dstBuf = (LZ4_byte*)malloc((*lz4fWrite)->dstBufMaxSize);
  if ((*lz4fWrite)->dstBuf == NULL) {
    LZ4F_freeAndNullWriteFile(lz4fWrite);
    RETURN_ERROR(allocation_failed);
  }

  ret = LZ4F_createCompressionContext(&(*lz4fWrite)->cctxPtr, LZ4F_VERSION);
  if (LZ4F_isError(ret)) {
      LZ4F_freeAndNullWriteFile(lz4fWrite);
      return ret;
  }

  ret = LZ4F_compressBegin((*lz4fWrite)->cctxPtr, buf, LZ4F_HEADER_SIZE_MAX, prefsPtr);
  if (LZ4F_isError(ret)) {
      LZ4F_freeAndNullWriteFile(lz4fWrite);
      return ret;
  }

  if (ret != fwrite(buf, 1, ret, fp)) {
    LZ4F_freeAndNullWriteFile(lz4fWrite);
    RETURN_ERROR(io_write);
  }

  (*lz4fWrite)->fp = fp;
  (*lz4fWrite)->errCode = LZ4F_OK_NoError;
  return LZ4F_OK_NoError;
}

size_t LZ4F_write(LZ4_writeFile_t* lz4fWrite, const void* buf, size_t size)
{
  const LZ4_byte* p = (const LZ4_byte*)buf;
  size_t remain = size;
  size_t chunk;
  size_t ret;

  if (lz4fWrite == NULL || buf == NULL)
    RETURN_ERROR(parameter_null);
  while (remain) {
    if (remain > lz4fWrite->maxWriteSize)
      chunk = lz4fWrite->maxWriteSize;
    else
      chunk = remain;

    ret = LZ4F_compressUpdate(lz4fWrite->cctxPtr,
                              lz4fWrite->dstBuf, lz4fWrite->dstBufMaxSize,
                              p, chunk,
                              NULL);
    if (LZ4F_isError(ret)) {
      lz4fWrite->errCode = ret;
      return ret;
    }

    if (ret != fwrite(lz4fWrite->dstBuf, 1, ret, lz4fWrite->fp)) {
      lz4fWrite->errCode = returnErrorCode(LZ4F_ERROR_io_write);
      RETURN_ERROR(io_write);
    }

    p += chunk;
    remain -= chunk;
  }

  return size;
}

LZ4F_errorCode_t LZ4F_writeClose(LZ4_writeFile_t* lz4fWrite)
{
  LZ4F_errorCode_t ret = LZ4F_OK_NoError;

  if (lz4fWrite == NULL) {
    RETURN_ERROR(parameter_null);
  }

  if (lz4fWrite->errCode == LZ4F_OK_NoError) {
    ret =  LZ4F_compressEnd(lz4fWrite->cctxPtr,
                            lz4fWrite->dstBuf, lz4fWrite->dstBufMaxSize,
                            NULL);
    if (LZ4F_isError(ret)) {
      goto out;
    }

    if (ret != fwrite(lz4fWrite->dstBuf, 1, ret, lz4fWrite->fp)) {
      ret = returnErrorCode(LZ4F_ERROR_io_write);
    }
  }

out:
  LZ4F_freeWriteFile(lz4fWrite);
  return ret;
}
