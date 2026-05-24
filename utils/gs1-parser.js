/**
 * GS1 Application Identifier Parser
 * 
 * Parses GS1-128 / GS1 DataMatrix raw strings into structured fields.
 * 
 * Key design:
 * - GS (ASCII 29, '\\x1D') is the segment separator
 * - Each GS-separated segment contains one or more fixed-length AIs,
 *   optionally ending with one variable-length AI
 * - Fixed-length AIs read exactly N chars; variable-length reads until end of segment
 * 
 * AI metadata table allows easy extension.
 */

const GS = '\x1D'

// ---------- AI Definitions ----------
// Each entry:
//   prefix: string
//   fixed: number | null  (null = variable, terminated by GS or end of segment)
//   maxLen: max chars for variable AIs (safety cap)
//   label: human-readable field name

const AI_DEFS = [
  { prefix: '01',   fixed: 14,  label: 'GTIN' },
  { prefix: '02',   fixed: 14,  label: 'CONTENT' },
  { prefix: '10',   fixed: null, label: 'BATCH/LOT',        maxLen: 20 },
  { prefix: '11',   fixed: 6,   label: 'PROD DATE' },
  { prefix: '12',   fixed: 6,   label: 'DUE DATE' },
  { prefix: '13',   fixed: 6,   label: 'PACK DATE' },
  { prefix: '15',   fixed: 6,   label: 'BEST BEFORE' },
  { prefix: '17',   fixed: 6,   label: 'EXPIRY' },
  { prefix: '20',   fixed: 2,   label: 'VARIANT' },
  { prefix: '21',   fixed: null, label: 'SERIAL',           maxLen: 20 },
  { prefix: '22',   fixed: null, label: 'CPV',              maxLen: 20 },
  { prefix: '240',  fixed: null, label: 'ADDITIONAL ID',     maxLen: 30 },
  { prefix: '241',  fixed: null, label: 'CUST PART',         maxLen: 30 },
  { prefix: '242',  fixed: null, label: 'MTO VARIANT',       maxLen: 6 },
  { prefix: '243',  fixed: null, label: 'PCN',               maxLen: 20 },
  { prefix: '250',  fixed: null, label: 'SECONDARY SERIAL',  maxLen: 30 },
  { prefix: '251',  fixed: null, label: 'REF TO SOURCE',     maxLen: 30 },
  { prefix: '253',  fixed: null, label: 'GDTI',              maxLen: 30 },
  { prefix: '254',  fixed: null, label: 'GLN EXTENSION',     maxLen: 20 },
  { prefix: '255',  fixed: null, label: 'GCN',               maxLen: 25 },
  { prefix: '30',   fixed: null, label: 'VAR COUNT',         maxLen: 8 },
  { prefix: '3100', fixed: 7,   label: 'NET WEIGHT (kg.0)' },
  { prefix: '3101', fixed: 7,   label: 'NET WEIGHT (kg.1)' },
  { prefix: '3102', fixed: 7,   label: 'NET WEIGHT (kg.2)' },
  { prefix: '3103', fixed: 7,   label: 'NET WEIGHT (kg.3)' },
  { prefix: '3104', fixed: 7,   label: 'NET WEIGHT (kg.4)' },
  { prefix: '3105', fixed: 7,   label: 'NET WEIGHT (kg.5)' },
  { prefix: '3200', fixed: 7,   label: 'NET WEIGHT (lb.0)' },
  { prefix: '3201', fixed: 7,   label: 'NET WEIGHT (lb.1)' },
  { prefix: '37',   fixed: null, label: 'COUNT',             maxLen: 8 },
  { prefix: '400',  fixed: null, label: 'ORDER NUMBER',      maxLen: 30 },
  { prefix: '410',  fixed: 13,  label: 'SHIP TO LOC' },
  { prefix: '411',  fixed: 13,  label: 'BILL TO LOC' },
  { prefix: '412',  fixed: 13,  label: 'PURCHASE FROM' },
  { prefix: '413',  fixed: 13,  label: 'SHIP FOR LOC' },
  { prefix: '414',  fixed: 13,  label: 'LOC NO' },
  { prefix: '420',  fixed: null, label: 'SHIP TO POST',      maxLen: 20 },
  { prefix: '421',  fixed: null, label: 'SHIP TO POST (ISO)', maxLen: 12 },
  { prefix: '422',  fixed: 3,   label: 'ORIGIN' },
  { prefix: '423',  fixed: null, label: 'COUNTRY INITIAL',   maxLen: 15 },
  { prefix: '424',  fixed: 3,   label: 'PROCESS COUNTRY' },
  { prefix: '425',  fixed: null, label: 'DISOUNTRIES',       maxLen: 15 },
  { prefix: '426',  fixed: 3,   label: 'FULL PROCESS CHAIN' },
  { prefix: '7001', fixed: 13,  label: 'NATO STOCK NO' },
  { prefix: '7002', fixed: null, label: 'UN/ECE CLASS',      maxLen: 30 },
  { prefix: '7003', fixed: 10,  label: 'EXPIRY DATE+TIME' },
  { prefix: '7004', fixed: null, label: 'ACTIVE POTENCY',    maxLen: 4 },
  { prefix: '7030', fixed: null, label: 'PROCESSOR APPROVAL', maxLen: 30 },
  { prefix: '710',  fixed: null, label: 'NHRN PZN (DE)',      maxLen: 20 },
  { prefix: '711',  fixed: null, label: 'NHRN CIP (FR)',      maxLen: 20 },
  { prefix: '712',  fixed: null, label: 'NHRN CN (ES)',       maxLen: 20 },
  { prefix: '713',  fixed: null, label: 'NHRN AIC (IT)',      maxLen: 20 },
  { prefix: '714',  fixed: null, label: 'NHRN (UK)',          maxLen: 20 },
  { prefix: '8001', fixed: 14,  label: 'DIMENSIONS' },
  { prefix: '8002', fixed: null, label: 'CMT NO',            maxLen: 20 },
  { prefix: '8003', fixed: null, label: 'GRAI',              maxLen: 30 },
  { prefix: '8004', fixed: null, label: 'GIAI',              maxLen: 30 },
  { prefix: '8005', fixed: 6,   label: 'PRICE PER UNIT' },
  { prefix: '8006', fixed: null, label: 'GCTIN',             maxLen: 18 },
  { prefix: '8007', fixed: null, label: 'IBAN',              maxLen: 34 },
  { prefix: '8008', fixed: null, label: 'PROD TIME',         maxLen: 12 },
  { prefix: '8010', fixed: null, label: 'CPID',              maxLen: 30 },
  { prefix: '8011', fixed: null, label: 'CPID SERIAL',       maxLen: 12 },
  { prefix: '8012', fixed: null, label: 'VERSION',           maxLen: 20 },
  { prefix: '8013', fixed: null, label: 'GMN',               maxLen: 30 },
  { prefix: '8017', fixed: 18,  label: 'GSRN PROVIDER' },
  { prefix: '8018', fixed: 18,  label: 'GSRN RECIPIENT' },
  { prefix: '8019', fixed: null, label: 'SRIN',              maxLen: 10 },
  { prefix: '8020', fixed: null, label: 'REF NO',            maxLen: 25 },
  { prefix: '8026', fixed: null, label: 'SGTIN PIECES',      maxLen: 18 },
  { prefix: '8110', fixed: null, label: 'COUPON (US)',       maxLen: 70 },
  { prefix: '8111', fixed: 4,   label: 'LOYALTY POINTS' },
  { prefix: '8112', fixed: null, label: 'PAPER COUPON',      maxLen: 70 },
  { prefix: '8200', fixed: null, label: 'EXT URL',           maxLen: 70 },
  { prefix: '90',   fixed: null, label: 'INTERNAL',          maxLen: 30 },
  { prefix: '91',   fixed: null, label: 'INTERNAL 91',       maxLen: 90 },
  { prefix: '92',   fixed: null, label: 'INTERNAL 92',       maxLen: 90 },
  { prefix: '93',   fixed: null, label: 'INTERNAL 93',       maxLen: 90 },
  { prefix: '94',   fixed: null, label: 'INTERNAL 94',       maxLen: 90 },
  { prefix: '95',   fixed: null, label: 'INTERNAL 95',       maxLen: 90 },
  { prefix: '96',   fixed: null, label: 'INTERNAL 96',       maxLen: 90 },
  { prefix: '97',   fixed: null, label: 'INTERNAL 97',       maxLen: 90 },
  { prefix: '98',   fixed: null, label: 'INTERNAL 98',       maxLen: 90 },
  { prefix: '99',   fixed: null, label: 'INTERNAL 99',       maxLen: 90 },
]

// Sort by prefix length descending so longer prefixes match first (e.g. "3100" before "31")
AI_DEFS.sort((a, b) => b.prefix.length - a.prefix.length || a.prefix.localeCompare(b.prefix))

// ---------- Helpers ----------

/** Format a YYMMDD date string to readable format */
function formatDate6(dateStr) {
  if (!dateStr || dateStr.length !== 6) return dateStr
  const yy = parseInt(dateStr.substring(0, 2))
  const mm = dateStr.substring(2, 4)
  const dd = dateStr.substring(4, 6)
  const year = yy < 50 ? 2000 + yy : 1900 + yy
  return `${year}-${mm}-${dd}`
}

/** Find AI definition by prefix at a given position in a string */
function findAI(str, pos) {
  for (const ai of AI_DEFS) {
    if (str.startsWith(ai.prefix, pos)) {
      return ai
    }
  }
  return null
}

/**
 * Parse one segment (between GS separators).
 * A segment contains 1+ fixed-length AIs, optionally ending with one variable-length AI.
 * 
 * @param {string} seg - The segment string (no GS chars inside)
 * @param {boolean} isLast - Whether this is the last segment
 * @returns {Array<{ai: string, label: string, value: string, raw: string}>}
 */
function parseSegment(seg, isLast) {
  const fields = []
  let pos = 0

  while (pos < seg.length) {
    const ai = findAI(seg, pos)
    if (!ai) {
      // Unknown data — skip this character
      pos++
      continue
    }

    pos += ai.prefix.length

    let value
    if (ai.fixed !== null) {
      // Fixed-length: read exactly N chars
      value = seg.substring(pos, pos + ai.fixed)
      pos += ai.fixed
    } else {
      // Variable-length: read until end of segment (GS-terminated)
      value = seg.substring(pos)
      pos = seg.length

      // Enforce max length safety cap
      if (ai.maxLen && value.length > ai.maxLen) {
        value = value.substring(0, ai.maxLen)
      }
    }

    if (!value) continue

    // Format known date fields
    let displayValue = value
    if (['11', '12', '13', '15', '17'].includes(ai.prefix) && value.length === 6) {
      displayValue = formatDate6(value)
    }

    fields.push({
      ai: ai.prefix,
      label: ai.label,
      value: displayValue,
      raw: value
    })
  }

  return fields
}

// ---------- Main Parser ----------

/**
 * Parse a GS1 raw string into structured fields.
 * 
 * Parsing strategy:
 * 1. Strip symbology identifier prefix (]C1, ]d2, ]e0 etc.)
 * 2. Split remaining string by GS (ASCII 29) separators
 * 3. Parse each GS-separated segment independently — each segment is
 *    a sequence of fixed-length AIs optionally ending with one variable AI
 * 
 * @param {string} raw - Raw GS1 data string
 * @returns {{
 *   gtin?: string,
 *   lot?: string,
 *   expirationDate?: string,
 *   productionDate?: string,
 *   bestBefore?: string,
 *   serial?: string,
 *   count?: string,
 *   netWeight?: string,
 *   fields: Array<{ai: string, label: string, value: string, raw: string}>,
 *   isGS1: boolean,
 *   raw: string
 * }}
 */
function parseGS1(raw) {
  const result = {
    gtin: undefined,
    lot: undefined,
    expirationDate: undefined,
    productionDate: undefined,
    bestBefore: undefined,
    serial: undefined,
    count: undefined,
    netWeight: undefined,
    fields: [],
    isGS1: false,
    raw: raw || ''
  }

  if (!raw) return result

  // Quick GS1 detection
  const hasGS1 = raw.charCodeAt(0) === 29 || raw.startsWith(']C1') || raw.startsWith(']d') || raw.startsWith(']e')

  // Strip symbology identifier prefix (keep GS separators)
  let cleaned = raw.replace(/^\]C1|^\]d[0-2]?|^\]e[0-2]/, '')

  // Also check if it starts with "01" (GS1 GTIN without symbology prefix)
  const startsWithAI = cleaned.startsWith('01')
  result.isGS1 = hasGS1 || startsWithAI

  if (!result.isGS1) {
    result.fields.push({ ai: '--', label: 'RAW', value: raw, raw: raw })
    return result
  }

  // Split by GS separators — each segment is independently parseable
  const segments = cleaned.split(GS)

  // Parse each segment
  segments.forEach((seg, i) => {
    if (!seg) return
    const isLast = i === segments.length - 1
    const segFields = parseSegment(seg, isLast)
    result.fields.push(...segFields)
  })

  // Map known AIs to top-level shortcuts
  result.fields.forEach(f => {
    switch (f.ai) {
      case '01': result.gtin = f.raw; break
      case '10': result.lot = f.raw; break
      case '17': result.expirationDate = f.value; break
      case '11': result.productionDate = f.value; break
      case '15': result.bestBefore = f.value; break
      case '21': result.serial = f.raw; break
      case '30': result.count = f.raw; break
      case '37': result.count = result.count || f.raw; break
    }
  })

  return result
}

/**
 * Generate a compact summary string for GS1 records (for card display).
 * @param {object} parsed - Parsed GS1 result
 * @returns {string}
 */
function formatSummary(parsed) {
  const parts = []
  if (parsed.gtin) parts.push('GTIN:' + parsed.gtin)
  if (parsed.lot) parts.push('LOT:' + parsed.lot)
  if (parsed.expirationDate) parts.push('EXP:' + parsed.expirationDate)
  if (parsed.serial) parts.push('SN:' + parsed.serial)
  if (parts.length === 0) parts.push(parsed.raw)
  return parts.join(' · ')
}

module.exports = {
  parseGS1,
  formatSummary,
  GS
}
