'use strict';
// Luau lexer. Source is a *byte string* (each char code < 256, UTF-8 encoded).
class LuauSyntaxError extends Error {
  constructor(msg, line) { super(msg); this.name = 'LuauSyntaxError'; this.line = line; }
}
const KEYWORDS = new Set(['and', 'break', 'do', 'else', 'elseif', 'end', 'false', 'for', 'function', 'if', 'in', 'local', 'nil', 'not', 'or', 'repeat', 'return', 'then', 'true', 'until', 'while']);
const OPS3 = ['...', '//=', '..='];
const OPS2 = ['==', '~=', '<=', '>=', '..', '//', '::', '->', '+=', '-=', '*=', '/=', '%=', '^='];
const ESC = { n: '\n', t: '\t', r: '\r', a: '\x07', b: '\b', f: '\f', v: '\v', '\\': '\\', '"': '"', "'": "'", '`': '`', '{': '{' };

function utf8enc(s) { // JS string -> byte string
  let ascii = true;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) return s;
  let out = '';
  for (const ch of s) {
    let c = ch.codePointAt(0);
    if (c < 0x80) out += ch;
    else if (c < 0x800) out += String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out += String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out += String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}
function utf8dec(s) { // byte string -> JS string (lenient)
  let ascii = true;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) > 127) { ascii = false; break; }
  if (ascii) return s;
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
  return new TextDecoder('utf-8').decode(b);
}
function cpToUtf8(c) {
  if (c < 0x80) return String.fromCharCode(c);
  if (c < 0x800) return String.fromCharCode(0xC0 | (c >> 6), 0x80 | (c & 63));
  if (c < 0x10000) return String.fromCharCode(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  if (c < 0x200000) return String.fromCharCode(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  if (c < 0x4000000) return String.fromCharCode(0xF8 | (c >> 24), 0x80 | ((c >> 18) & 63), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  return String.fromCharCode(0xFC | (c >> 30), 0x80 | ((c >> 24) & 63), 0x80 | ((c >> 18) & 63), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
}
const isAlpha = c => (c >= 65 && c <= 90) || (c >= 97 && c <= 122) || c === 95;
const isDigit = c => c >= 48 && c <= 57;
const isAlnum = c => isAlpha(c) || isDigit(c);
const isHex = c => isDigit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);

// tokenize(src, fname) -> tokens [{k, v, line}] ; kinds: name kw num str istr op eof
function tokenize(src, fname, startPos, startLine, stopAtBrace) {
  const toks = [];
  let i = startPos || 0, line = startLine || 1;
  const n = src.length;
  const err = (m) => { throw new LuauSyntaxError(`${fname}:${line}: ${m}`, line); };
  if (!startPos && src.startsWith('#!')) while (i < n && src[i] !== '\n') i++;
  const longBracket = (pos) => {
    let j = pos + 1, lvl = 0;
    while (j < n && src[j] === '=') { lvl++; j++; }
    return (j < n && src[j] === '[') ? [lvl, j + 1] : null;
  };
  const countNl = (a, b) => { let c = 0; for (let k = a; k < b; k++) if (src.charCodeAt(k) === 10) c++; return c; };
  let depth = 0;
  while (i < n) {
    const ch = src.charCodeAt(i);
    if (ch === 10) { line++; i++; continue; }
    if (ch === 32 || ch === 9 || ch === 13) { i++; continue; }
    if (ch === 45 && src.charCodeAt(i + 1) === 45) { // comment
      i += 2;
      if (src[i] === '[') {
        const lb = longBracket(i);
        if (lb) {
          const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
          if (e < 0) err('unfinished long comment');
          line += countNl(i, e); i = e + close.length; continue;
        }
      }
      while (i < n && src.charCodeAt(i) !== 10) i++;
      continue;
    }
    if (isAlpha(ch)) {
      let j = i + 1; while (j < n && isAlnum(src.charCodeAt(j))) j++;
      const w = src.slice(i, j);
      toks.push({ k: KEYWORDS.has(w) ? 'kw' : 'name', v: w, line }); i = j; continue;
    }
    if (isDigit(ch) || (ch === 46 && isDigit(src.charCodeAt(i + 1)))) {
      let j = i, v;
      if (ch === 48 && (src[i + 1] === 'x' || src[i + 1] === 'X')) {
        j = i + 2; while (j < n && (isHex(src.charCodeAt(j)) || src[j] === '_')) j++;
        v = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 16);
      } else if (ch === 48 && (src[i + 1] === 'b' || src[i + 1] === 'B')) {
        j = i + 2; while (j < n && (src[j] === '0' || src[j] === '1' || src[j] === '_')) j++;
        v = parseInt(src.slice(i + 2, j).replace(/_/g, ''), 2);
      } else {
        while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++;
        if (src[j] === '.') { j++; while (j < n && (isDigit(src.charCodeAt(j)) || src[j] === '_')) j++; }
        if (src[j] === 'e' || src[j] === 'E') {
          let k = j + 1; if (src[k] === '+' || src[k] === '-') k++;
          if (isDigit(src.charCodeAt(k))) { j = k; while (j < n && isDigit(src.charCodeAt(j))) j++; }
        }
        v = parseFloat(src.slice(i, j).replace(/_/g, ''));
      }
      if (j < n && isAlpha(src.charCodeAt(j))) err('malformed number');
      toks.push({ k: 'num', v, line }); i = j; continue;
    }
    if (ch === 34 || ch === 39) {
      const q = src[i]; let j = i + 1; const buf = [];
      for (;;) {
        if (j >= n) err('unfinished string');
        const c = src[j];
        if (c === q) { j++; break; }
        if (c === '\n') err('unfinished string');
        if (c === '\\') { j = readEscape(j, buf, true); } else { buf.push(c); j++; }
      }
      toks.push({ k: 'str', v: buf.join(''), line }); i = j; continue;
    }
    if (ch === 96) { // interpolated string
      const startLn = line;
      let j = i + 1; const parts = []; let buf = [];
      for (;;) {
        if (j >= n) err('unfinished interpolated string');
        const c = src[j];
        if (c === '`') { j++; break; }
        if (c === '\\') { j = readEscape(j, buf, false); continue; }
        if (c === '{') {
          if (src[j + 1] === '{') err("interpolated string cannot contain '{{'");
          parts.push(buf.join('')); buf = [];
          const sub = tokenize(src, fname, j + 1, line, true);
          parts.push(sub.toks); line = sub.line; j = sub.end; continue;
        }
        if (c === '\n') line++;
        buf.push(c); j++;
      }
      parts.push(buf.join(''));
      toks.push({ k: 'istr', v: parts, line: startLn }); i = j; continue;
    }
    if (ch === 91) {
      const lb = longBracket(i);
      if (lb) {
        const close = ']' + '='.repeat(lb[0]) + ']', e = src.indexOf(close, lb[1]);
        if (e < 0) err('unfinished long string');
        let s = src.slice(lb[1], e);
        if (s.startsWith('\r\n')) s = s.slice(2); else if (s.startsWith('\n')) s = s.slice(1);
        toks.push({ k: 'str', v: s.replace(/\r\n/g, '\n'), line }); line += countNl(i, e); i = e + close.length; continue;
      }
    }
    if (stopAtBrace) {
      if (ch === 123) depth++;
      else if (ch === 125) { if (depth === 0) { toks.push({ k: 'eof', v: null, line }); return { toks, end: i + 1, line }; } depth--; }
    }
    const s3 = src.slice(i, i + 3);
    if (OPS3.includes(s3)) { toks.push({ k: 'op', v: s3, line }); i += 3; continue; }
    const s2 = src.slice(i, i + 2);
    if (OPS2.includes(s2)) { toks.push({ k: 'op', v: s2, line }); i += 2; continue; }
    if ('+-*/%^#<>=(){}[];:,.&|?~@'.includes(src[i])) { toks.push({ k: 'op', v: src[i], line }); i++; continue; }
    err('unexpected character ' + JSON.stringify(src[i]));
  }
  if (stopAtBrace) err('unfinished interpolated string expression');
  toks.push({ k: 'eof', v: null, line });
  return toks;

  function readEscape(j, buf, allowNum) {
    j++; const e = src[j];
    if (e === undefined) err('unfinished string');
    if (Object.prototype.hasOwnProperty.call(ESC, e)) { buf.push(ESC[e]); return j + 1; }
    if (e === '\n') { buf.push('\n'); line++; return j + 1; }
    if (e === '\r') { buf.push('\n'); line++; return src[j + 1] === '\n' ? j + 2 : j + 1; }
    if (e === 'z') { j++; while (j < n && ' \t\r\n'.includes(src[j])) { if (src[j] === '\n') line++; j++; } return j; }
    if (e === 'x') {
      const h = src.slice(j + 1, j + 3);
      if (!/^[0-9a-fA-F]{2}$/.test(h)) err('hexadecimal digit expected');
      buf.push(String.fromCharCode(parseInt(h, 16))); return j + 3;
    }
    if (e === 'u') {
      if (src[j + 1] !== '{') err("missing '{' in \\u{xxxx}");
      const k = src.indexOf('}', j);
      if (k < 0) err("missing '}' in \\u{xxxx}");
      buf.push(cpToUtf8(parseInt(src.slice(j + 2, k), 16))); return k + 1;
    }
    if (isDigit(e.charCodeAt(0))) {
      let k = j; while (k < n && k < j + 3 && isDigit(src.charCodeAt(k))) k++;
      const v = parseInt(src.slice(j, k), 10);
      if (v > 255) err('decimal escape too large');
      buf.push(String.fromCharCode(v)); return k;
    }
    err('invalid escape sequence');
  }
}
module.exports = { tokenize, LuauSyntaxError, utf8enc, utf8dec, cpToUtf8 };
