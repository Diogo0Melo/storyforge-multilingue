/**
 * Restructure panels.json codex.field flat-keys into nested objects.
 * - "mineral.appearance": "外观" → field.mineral.appearance: "外观"
 * - "mineral.rank.option.0": "凡品" → fieldOption.mineral.rank.0: "凡品"
 * - "mineral.appearance.placeholder": "..." → fieldPlaceholder.mineral.appearance: "..."
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const LOCALES = ['zh-CN', 'pt-BR']

/** Set a nested value: setNested(target, ['a','b','c'], val) => target.a.b.c = val */
function setNested(target, segments, value) {
  let obj = target
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i]
    if (!(seg in obj) || typeof obj[seg] !== 'object' || obj[seg] === null) {
      obj[seg] = {}
    }
    obj = obj[seg]
  }
  obj[segments[segments.length - 1]] = value
}

for (const locale of LOCALES) {
  const filePath = resolve(__dirname, '..', 'public', 'locales', locale, 'panels.json')
  const root = JSON.parse(readFileSync(filePath, 'utf-8'))
  const codex = root.codex
  if (!codex) {
    console.log(`[${locale}] No codex section, skipping`)
    continue
  }

  const oldField = codex.field || {}
  const field = {}
  const fieldOption = {}
  const fieldPlaceholder = {}

  for (const [key, value] of Object.entries(oldField)) {
    if (/\.option\.\d+$/.test(key)) {
      // e.g. "mineral.rank.option.0" -> fieldOption.mineral.rank.0
      const m = key.match(/^(.+)\.option\.(\d+)$/)
      const path = m[1].split('.')
      path.push(m[2])
      setNested(fieldOption, path, value)
    } else if (/\.placeholder$/.test(key)) {
      // e.g. "mineral.appearance.placeholder" -> fieldPlaceholder.mineral.appearance
      const path = key.replace(/\.placeholder$/, '').split('.')
      setNested(fieldPlaceholder, path, value)
    } else {
      // Regular field label: "mineral.appearance" -> field.mineral.appearance
      const path = key.split('.')
      setNested(field, path, value)
    }
  }

  codex.field = field
  codex.fieldOption = fieldOption
  codex.fieldPlaceholder = fieldPlaceholder

  writeFileSync(filePath, JSON.stringify(root, null, 2) + '\n')
  console.log(`[${locale}] Restructured: field categories=${Object.keys(field).length}, fieldOption categories=${Object.keys(fieldOption).length}, fieldPlaceholder categories=${Object.keys(fieldPlaceholder).length}`)
}

console.log('Done.')
