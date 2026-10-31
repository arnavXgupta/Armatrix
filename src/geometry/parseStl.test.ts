import { describe, expect, test } from 'vitest'
import { cube, toAscii, toBinary, type Tri } from './fixtures'
import { guessUnits, parseStl } from './parseStl'

const unitBox = { min: [0, 0, 0], max: [1, 1, 1] }

describe('parseStl', () => {
  test('binary cube', () => {
    const m = parseStl(toBinary(cube()))
    expect(m).toMatchObject({ triangles: 12, dropped: 0, format: 'binary', bbox: unitBox })
    expect(m.positions.length).toBe(12 * 9)
  })

  test('ASCII cube with CRLF and scientific notation', () => {
    const m = parseStl(toAscii(cube(), { crlf: true, sci: true }))
    expect(m).toMatchObject({ triangles: 12, format: 'ascii', bbox: unitBox })
  })

  test('ASCII without endsolid and with trailing garbage', () => {
    const m = parseStl(toAscii(cube(), { endsolid: false, tail: 'garbage \u0000 here' }))
    expect(m.triangles).toBe(12)
  })

  test('binary whose header starts with "solid" is still binary', () => {
    const m = parseStl(toBinary(cube(), 'solid exported by some CAD tool'))
    expect(m).toMatchObject({ triangles: 12, format: 'binary' })
  })

  test('binary with padding after the last triangle', () => {
    const src = new Uint8Array(toBinary(cube()))
    const padded = new Uint8Array(src.length + 7)
    padded.set(src)
    expect(parseStl(padded.buffer).triangles).toBe(12)
  })

  test('degenerate and NaN triangles are dropped and counted', () => {
    const p: Tri = [
      [0, 0, 0],
      [0, 0, 0],
      [1, 0, 0],
    ]
    const nan: Tri = [
      [NaN, 0, 0],
      [0, 1, 0],
      [1, 0, 0],
    ]
    const m = parseStl(toBinary([...cube(), p, nan]))
    expect(m).toMatchObject({ triangles: 12, dropped: 2, bbox: unitBox })
    expect(m.positions.length).toBe(12 * 9)
  })

  test('truncated binary throws a readable error', () => {
    const cut = toBinary(cube()).slice(0, 84 + 50 * 5 + 20)
    expect(() => parseStl(cut)).toThrow(/truncated/)
  })

  test('empty file, zero-triangle binary and random text throw', () => {
    expect(() => parseStl(new ArrayBuffer(0))).toThrow(/empty/)
    expect(() => parseStl(toBinary([]))).toThrow(/no usable triangles/)
    expect(() => parseStl(new TextEncoder().encode('hello, not a mesh').buffer as ArrayBuffer)).toThrow(/not a readable STL/)
  })
})

test('guessUnits', () => {
  const ext = (l: number) => guessUnits({ min: [0, 0, 0], max: [l, l / 2, 1e-3] })
  expect(ext(120)).toBe('mm')
  expect(ext(3.5)).toBe('in')
  expect(ext(0.02)).toBe('unknown')
  expect(ext(50_000)).toBe('unknown')
})
