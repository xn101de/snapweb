import { describe, it, expect } from 'vitest'
import { safeImageUrl } from './util'

describe('safeImageUrl', () => {
  it('allows http / https / data urls', () => {
    expect(safeImageUrl('http://host/art.png')).toBe('http://host/art.png')
    expect(safeImageUrl('https://host/art.png')).toBe('https://host/art.png')
    expect(safeImageUrl('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA')
  })

  it('rejects dangerous or unexpected schemes', () => {
    expect(safeImageUrl('javascript:alert(1)')).toBeUndefined()
    expect(safeImageUrl('file:///etc/passwd')).toBeUndefined()
    expect(safeImageUrl('vbscript:msgbox')).toBeUndefined()
  })

  it('handles empty / unparseable input', () => {
    expect(safeImageUrl(undefined)).toBeUndefined()
    expect(safeImageUrl('')).toBeUndefined()
    expect(safeImageUrl('not a url ::: ')).toBeUndefined()
  })
})
