/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

// Vitest stubs CSS imports (even ?raw), so read the files directly.
const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8')
const decls = (css: string) => (css.match(/--[\w-]+:\s*[^;]+;/g) ?? []).map((d) => d.replace(/\s+/g, ' '))

test('tokens.css carries every token declared in brand.md', () => {
  const block = read('../../brand.md').split('```css')[1].split('```')[0]
  const want = decls(block)
  expect(want.length).toBeGreaterThan(30)
  expect(decls(read('./tokens.css'))).toEqual(expect.arrayContaining(want))
})
