import fs from 'node:fs'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const pdfParseModule = require('pdf-parse')
const pdfParse = typeof pdfParseModule === 'function' ? pdfParseModule : (pdfParseModule.default || pdfParseModule.pdfParse)

const buf = fs.readFileSync('scripts/test-md-output.pdf')
const result = await pdfParse(buf)
const pages = (result.text || '').split(/\f/)
pages.forEach((p, idx) => {
  console.log(`\n=== Page ${idx + 1} ===`)
  console.log(p.trim().substring(0, 2000))
  console.log('...')
})