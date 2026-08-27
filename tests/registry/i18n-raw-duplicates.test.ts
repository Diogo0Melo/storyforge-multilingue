/**
 * i18n locale raw-source integrity guard (duplicate object keys)
 *
 * Why this exists: every other i18n registry test loads locale files through
 * Vite's JSON module pipeline (import.meta.glob / JSON.parse), which silently
 * keeps only the LAST occurrence of a duplicated object key. A duplicated key
 * therefore passes key-parity (i18n.test.ts) and value guards (i18n-values.
 * test.ts) while hiding a merge/edit accident in the source file. This guard
 * scans the RAW text of every locale JSON — before any module parsing — and
 * fails on:
 *
 *   (a) duplicate keys within the same JSON object, reported as
 *       `<file>:<line>:<column> -> <dotted.key.path>`;
 *   (b) malformed JSON (the scanner validates structure as it walks).
 *
 * The scanner is a small self-contained tokenizer with no dependencies. It
 * understands strings (including escapes), nested objects/arrays and all JSON
 * value literals, so braces/colons/commas inside string values cannot confuse
 * it. Duplicate detection is scoped per object: the same key name in different
 * objects is legal and is not reported.
 */
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'

interface DuplicateKeyFinding {
  /** Repo-relative path, e.g. src/i18n/locales/zh-CN/editor.json */
  file: string
  /** Dotted path of the duplicated key, e.g. toolbar.impactFactsCount */
  keyPath: string
  /** 1-based line/column of the repeated key occurrence */
  line: number
  column: number
}

/**
 * Scan raw JSON source text for duplicate object keys.
 *
 * Throws with `file:line:column` context when the source is not valid JSON.
 * Returns one finding per repeated occurrence (the second and later copies of
 * a key inside the same object).
 */
function scanJsonForDuplicateKeys(source: string, file: string): DuplicateKeyFinding[] {
  const findings: DuplicateKeyFinding[] = []
  // Tolerate a UTF-8 BOM; Vite strips it when loading JSON modules.
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  let pos = 0

  const lineColumnAt = (offset: number): { line: number; column: number } => {
    let line = 1
    let column = 1
    for (let i = 0; i < offset && i < text.length; i++) {
      if (text.charCodeAt(i) === 10) {
        line += 1
        column = 1
      } else {
        column += 1
      }
    }
    return { line, column }
  }

  const fail = (message: string): never => {
    const { line, column } = lineColumnAt(pos)
    throw new Error(`${file}:${line}:${column}: ${message}`)
  }

  const skipWhitespace = (): void => {
    while (pos < text.length) {
      const c = text.charCodeAt(pos)
      if (c === 32 || c === 9 || c === 10 || c === 13) pos += 1
      else break
    }
  }

  const ESCAPES: Record<string, string> = {
    '"': '"',
    '\\': '\\',
    '/': '/',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
  }

  /** Reads a string literal; pos must point at the opening double quote. */
  const readString = (): string => {
    pos += 1 // opening quote
    let out = ''
    while (pos < text.length) {
      const ch = text[pos]
      if (ch === '"') {
        pos += 1
        return out
      }
      if (ch === '\\') {
        pos += 1
        if (pos >= text.length) fail('unterminated escape sequence in string')
        const esc = text[pos]
        if (esc === 'u') {
          const hex = text.slice(pos + 1, pos + 5)
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('invalid \\u escape in string')
          out += String.fromCharCode(Number.parseInt(hex, 16))
          pos += 5
        } else {
          const mapped = ESCAPES[esc]
          if (mapped === undefined) fail(`invalid escape sequence "\\${esc}" in string`)
          out += mapped
          pos += 1
        }
        continue
      }
      if (ch === '\n') fail('unterminated string (newline before closing quote)')
      out += ch
      pos += 1
    }
    return fail('unterminated string at end of file')
  }

  const expectLiteral = (word: string): void => {
    if (text.startsWith(word, pos)) pos += word.length
    else fail(`invalid value (expected "${word}")`)
  }

  const isDigit = (ch: string | undefined): boolean =>
    ch !== undefined && ch >= '0' && ch <= '9'

  const skipNumber = (): void => {
    if (text[pos] === '-') pos += 1
    if (text[pos] === '0') {
      pos += 1
      if (isDigit(text[pos])) fail('invalid number (leading zero)')
    } else if (isDigit(text[pos])) {
      while (isDigit(text[pos])) pos += 1
    } else {
      fail('invalid number (no digits)')
    }
    if (text[pos] === '.') {
      pos += 1
      if (!isDigit(text[pos])) fail('invalid number (no digits after decimal point)')
      while (isDigit(text[pos])) pos += 1
    }
    if (text[pos] === 'e' || text[pos] === 'E') {
      pos += 1
      if (text[pos] === '+' || text[pos] === '-') pos += 1
      if (!isDigit(text[pos])) fail('invalid number (no digits in exponent)')
      while (isDigit(text[pos])) pos += 1
    }
  }

  const parseObject = (pathPrefix: string): void => {
    pos += 1 // '{'
    const seen = new Set<string>()
    skipWhitespace()
    if (text[pos] === '}') {
      pos += 1
      return
    }
    for (;;) {
      skipWhitespace()
      if (pos >= text.length) fail('unexpected end of input inside object')
      if (text[pos] !== '"') fail('expected object key (string)')
      const keyOffset = pos
      const key = readString()
      skipWhitespace()
      if (pos >= text.length || text[pos] !== ':') fail('expected ":" after object key')
      pos += 1
      const keyPath = pathPrefix ? `${pathPrefix}.${key}` : key
      if (seen.has(key)) {
        const { line, column } = lineColumnAt(keyOffset)
        findings.push({ file, keyPath, line, column })
      } else {
        seen.add(key)
      }
      parseValue(keyPath)
      skipWhitespace()
      if (pos >= text.length) fail('unexpected end of input inside object')
      if (text[pos] === ',') {
        pos += 1
        continue
      }
      if (text[pos] === '}') {
        pos += 1
        return
      }
      fail(`unexpected character "${text[pos]}" inside object (expected "," or "}")`)
    }
  }

  const parseArray = (pathPrefix: string): void => {
    pos += 1 // '['
    skipWhitespace()
    if (text[pos] === ']') {
      pos += 1
      return
    }
    let index = 0
    for (;;) {
      parseValue(`${pathPrefix}[${index}]`)
      index += 1
      skipWhitespace()
      if (pos >= text.length) fail('unexpected end of input inside array')
      if (text[pos] === ',') {
        pos += 1
        continue
      }
      if (text[pos] === ']') {
        pos += 1
        return
      }
      fail(`unexpected character "${text[pos]}" inside array (expected "," or "]")`)
    }
  }

  const parseValue = (pathPrefix: string): void => {
    skipWhitespace()
    if (pos >= text.length) fail('unexpected end of input (expected a JSON value)')
    const ch = text[pos]
    if (ch === '{') return parseObject(pathPrefix)
    if (ch === '[') return parseArray(pathPrefix)
    if (ch === '"') {
      readString()
      return
    }
    if (ch === 't') return expectLiteral('true')
    if (ch === 'f') return expectLiteral('false')
    if (ch === 'n') return expectLiteral('null')
    if (ch === '-' || isDigit(ch)) return skipNumber()
    fail(`unexpected character "${ch}" (expected a JSON value)`)
  }

  parseValue('')
  skipWhitespace()
  if (pos < text.length) fail(`unexpected trailing content "${text[pos]}" after top-level value`)
  return findings
}

const LOCALES_ROOT = join(process.cwd(), 'src', 'i18n', 'locales')

/** Recursively collect every .json file under a directory (sorted). */
function collectJsonFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...collectJsonFiles(full))
    else if (entry.isFile() && entry.name.endsWith('.json')) out.push(full)
  }
  return out.sort()
}

/** Repo-relative POSIX path for stable, readable failure reports. */
const toRepoPath = (absPath: string): string =>
  relative(process.cwd(), absPath).split(sep).join('/')

describe('i18n locale raw-source integrity', () => {
  it('no locale JSON has duplicate object keys (raw scan, pre-module-parse)', () => {
    const files = collectJsonFiles(LOCALES_ROOT)
    expect(files.length, 'locale discovery must find JSON files').toBeGreaterThan(0)

    // Sanity: the walk must actually cover all supported locale directories,
    // otherwise an empty/partial scan would pass vacuously.
    const localeDirs = new Set(files.map(f => relative(LOCALES_ROOT, f).split(sep)[0]))
    for (const required of ['pt-BR', 'en', 'zh-CN']) {
      expect(localeDirs.has(required), `missing locale directory in scan: ${required}`).toBe(true)
    }

    const findings: DuplicateKeyFinding[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      findings.push(...scanJsonForDuplicateKeys(source, toRepoPath(file)))
    }

    if (findings.length > 0) {
      const details = findings
        .map(f => `  ${f.file}:${f.line}:${f.column} -> ${f.keyPath}`)
        .join('\n')
      throw new Error(
        `Found ${findings.length} duplicate object key(s) in locale JSON sources:\n${details}\n\n`
        + 'JSON module parsing silently keeps the LAST occurrence of a duplicate, so '
        + 'key-parity and value tests cannot see these. Remove the duplicated entries '
        + '(verify the intended value before choosing which copy to keep).',
      )
    }
    expect(findings).toEqual([])
  })

  it('scanner self-test: detects duplicates with file/path/line reporting', () => {
    const fixture = [
      '{',
      '  "a": 1,',
      '  "nested": { "x": true, "x": false },',
      '  "a": 2,',
      '  "arr": [ { "z": 1, "z": 2 } ]',
      '}',
    ].join('\n')
    const findings = scanJsonForDuplicateKeys(fixture, 'fixture.json')
    expect(findings).toEqual([
      { file: 'fixture.json', keyPath: 'nested.x', line: 3, column: 26 },
      { file: 'fixture.json', keyPath: 'a', line: 4, column: 3 },
      { file: 'fixture.json', keyPath: 'arr[0].z', line: 5, column: 22 },
    ])
  })

  it('scanner self-test: same key in different objects is legal', () => {
    const clean = '{ "a": { "x": 1 }, "b": { "x": 2 }, "a2": [1, 2] }'
    expect(scanJsonForDuplicateKeys(clean, 'clean.json')).toEqual([])
  })

  it('scanner self-test: braces/colons/escapes inside strings do not confuse it', () => {
    const tricky = [
      '{',
      '  "k{:,]}": "va\\"l: {ue}",',
      '  "u\\u0041": 1,',
      '  "k{:,]}": "dup with \\"quotes\\" and 中文"',
      '}',
    ].join('\n')
    const findings = scanJsonForDuplicateKeys(tricky, 'tricky.json')
    expect(findings).toHaveLength(1)
    expect(findings[0].keyPath).toBe('k{:,]}')
  })

  it('scanner self-test: malformed JSON fails loudly with position', () => {
    expect(() => scanJsonForDuplicateKeys('{ "a": 1,', 'bad.json'))
      .toThrow(/bad\.json:\d+:\d+:/)
    expect(() => scanJsonForDuplicateKeys('{ "a": 01 }', 'bad.json'))
      .toThrow(/leading zero/)
    expect(() => scanJsonForDuplicateKeys('{ "a": - }', 'bad.json'))
      .toThrow(/bad\.json/)
  })
})
