// Partial reads of a JSONL transcript: the head (first matching entry) and the tail
// (last matching entry), so a check never has to load a multi-MB file to look at one line.
// Malformed lines are skipped, exactly as a full parse would skip them.
import fs from 'node:fs';

export const CHUNK = 64 * 1024;
const NL = 0x0a;

function parseLine(buf) {
  const t = buf.toString('utf8').trim();
  if (!t) return undefined;
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

// First entry satisfying `pred`, scanning from the start. Reads `chunk` bytes at a time and
// only reads further when no complete line has matched yet (so a first line longer than the
// chunk is read in full). Returns null when none matches or the file is unreadable.
export function findFirst(file, pred, { chunk = CHUNK } = {}) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    let pos = 0;
    let pending = Buffer.alloc(0);
    for (;;) {
      const buf = Buffer.alloc(chunk);
      const n = fs.readSync(fd, buf, 0, chunk, pos);
      const eof = n === 0;
      pos += n;
      pending = Buffer.concat([pending, buf.subarray(0, n)]);
      let start = 0;
      for (;;) {
        const nl = pending.indexOf(NL, start);
        if (nl < 0) break;
        const e = parseLine(pending.subarray(start, nl));
        if (e !== undefined && pred(e)) return e;
        start = nl + 1;
      }
      pending = pending.subarray(start);
      if (eof) {
        const e = parseLine(pending);
        return e !== undefined && pred(e) ? e : null;
      }
    }
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

// Last entry satisfying `pred`, scanning backwards from the end in `chunk`-sized reads.
export function findLast(file, pred, { chunk = CHUNK } = {}) {
  let fd;
  try {
    fd = fs.openSync(file, 'r');
  } catch {
    return null;
  }
  try {
    let pos = fs.fstatSync(fd).size;
    let carry = Buffer.alloc(0); // bytes after the last newline already seen (an incomplete head)
    while (pos > 0) {
      const len = Math.min(chunk, pos);
      pos -= len;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, pos);
      let data = Buffer.concat([buf, carry]);
      // Everything up to the first newline may be the tail of a line that began earlier.
      let end = data.length;
      for (;;) {
        const nl = data.lastIndexOf(NL, end - 1);
        if (nl < 0) break;
        const e = parseLine(data.subarray(nl + 1, end));
        if (e !== undefined && pred(e)) return e;
        end = nl;
        if (end === 0) break;
      }
      carry = data.subarray(0, end);
      if (end === 0) carry = Buffer.alloc(0);
    }
    const e = parseLine(carry);
    return e !== undefined && pred(e) ? e : null;
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}
