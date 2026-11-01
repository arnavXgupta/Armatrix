import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { END, ROWS_FILE, START, rowsSource, schemaRows, schemaTable } from './schema-table.mjs'

it('README schema table matches the JSDoc in schema.ts (fix: npm run docs:schema)', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
  const inReadme = readme.slice(readme.indexOf(START) + START.length, readme.indexOf(END)).trim()
  expect(inReadme).toBe(schemaTable())
})

it('src/export/schemaRows.ts matches schema.ts (fix: npm run docs:schema)', () => {
  expect(readFileSync(ROWS_FILE, 'utf8').replace(/\r\n/g, '\n')).toBe(rowsSource(schemaRows()))
})

it('a field without JSDoc is refused', () => {
  const src = "export const SCHEMA_VERSION = '1.0'\nexport type WeldJob = {\n  name: string\n}\n"
  expect(() => schemaTable(src)).toThrow(/name has no JSDoc/)
})
