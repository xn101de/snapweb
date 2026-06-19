import { describe, it, expect, vi } from 'vitest'

// The wasm/audio dependencies aren't needed to exercise the pure wire-protocol
// classes; stub them so the module imports cleanly in the node test env.
vi.mock('libflacjs/dist/libflac.js', () => ({ default: {} }))
vi.mock('opus-decoder', () => ({ OpusDecoder: class {} }))
vi.mock('standardized-audio-context', () => ({ AudioContext: class {} }))

import {
  Tv,
  BaseMessage,
  TimeMessage,
  JsonMessage,
  HelloMessage,
  ServerSettingsMessage,
  PcmChunkMessage,
  SampleFormat,
  TimeProvider,
} from './snapstream'

describe('BaseMessage', () => {
  it('serializes the 26-byte header at the documented offsets', () => {
    const m = new BaseMessage()
    m.type = 7
    m.id = 42
    m.refersTo = 3
    m.sent = new Tv(1, 2)
    m.received = new Tv(3, 4)
    const buf = m.serialize()
    const v = new DataView(buf)
    expect(buf.byteLength).toBe(26)
    expect(v.getUint16(0, true)).toBe(7)
    expect(v.getUint16(2, true)).toBe(42)
    expect(v.getUint16(4, true)).toBe(3)
    expect(v.getInt32(6, true)).toBe(1) // sent.sec
    expect(v.getInt32(10, true)).toBe(2) // sent.usec
    expect(v.getInt32(14, true)).toBe(3) // received.sec
    expect(v.getUint32(22, true)).toBe(26) // size
  })

  it('round-trips the header fields through deserialize', () => {
    const m = new BaseMessage()
    m.type = 9
    m.id = 1234
    m.refersTo = 56
    const buf = m.serialize()
    const m2 = new BaseMessage()
    m2.deserialize(buf)
    expect(m2.type).toBe(9)
    expect(m2.id).toBe(1234)
    expect(m2.refersTo).toBe(56)
    expect(m2.size).toBe(26)
  })
})

describe('Tv', () => {
  it('converts to/from milliseconds', () => {
    const t = new Tv(0, 0)
    t.setMilliseconds(7500)
    expect(t.sec).toBe(7)
    expect(t.getMilliseconds()).toBe(7500)
  })
})

describe('TimeMessage', () => {
  it('round-trips the latency value (type 4, 8-byte body)', () => {
    const t = new TimeMessage()
    t.latency = new Tv(5, 6)
    const buf = t.serialize()
    expect(buf.byteLength).toBe(26 + 8)
    const t2 = new TimeMessage(buf)
    expect(t2.type).toBe(4)
    expect(t2.latency.sec).toBe(5)
    expect(t2.latency.usec).toBe(6)
  })
})

describe('JsonMessage (UTF-8 sizing — regression for the byte-length fix)', () => {
  it('writes the UTF-8 byte length into the size field, not the UTF-16 length', () => {
    const m = new JsonMessage()
    m.json = { name: 'Küche', volume: 42, list: ['Ä', 'Ö', 'ß'] }
    const jsonStr = JSON.stringify(m.json)
    const byteLen = new TextEncoder().encode(jsonStr).length

    // The payload has multibyte chars, so the test is only meaningful if the
    // two lengths actually differ.
    expect(jsonStr.length).toBeLessThan(byteLen)

    const buf = m.serialize()
    const v = new DataView(buf)
    expect(v.getUint32(26, true)).toBe(byteLen)
  })

  it('round-trips a non-ASCII payload without truncation', () => {
    const m = new JsonMessage()
    m.json = { name: 'Küche', nested: { city: 'Zürich', tags: ['naïve', 'café'] } }
    const m2 = new JsonMessage(m.serialize())
    expect(m2.json).toEqual({
      name: 'Küche',
      nested: { city: 'Zürich', tags: ['naïve', 'café'] },
    })
  })
})

describe('HelloMessage', () => {
  it('round-trips fields incl. a non-ASCII hostname (type 5)', () => {
    const h = new HelloMessage()
    h.mac = '00:11:22:33:44:55'
    h.hostname = 'Wohnzimmer-Küche'
    h.uniqueId = 'abc-123'
    h.os = 'TestOS'
    const h2 = new HelloMessage(h.serialize())
    expect(h2.type).toBe(5)
    expect(h2.mac).toBe('00:11:22:33:44:55')
    expect(h2.hostname).toBe('Wohnzimmer-Küche')
    expect(h2.uniqueId).toBe('abc-123')
    expect(h2.os).toBe('TestOS')
  })
})

describe('ServerSettingsMessage', () => {
  it('round-trips the settings payload (type 3)', () => {
    const s = new ServerSettingsMessage()
    s.bufferMs = 1000
    s.latency = 20
    s.volumePercent = 75
    s.muted = true
    const s2 = new ServerSettingsMessage(s.serialize())
    expect(s2.type).toBe(3)
    expect(s2.bufferMs).toBe(1000)
    expect(s2.latency).toBe(20)
    expect(s2.volumePercent).toBe(75)
    expect(s2.muted).toBe(true)
  })
})

describe('SampleFormat', () => {
  it('computes sample/frame sizes and rates (incl. the 24-bit special case)', () => {
    const sf = new SampleFormat() // defaults: 48000 / 2ch / 16bit
    expect(sf.sampleSize()).toBe(2)
    expect(sf.frameSize()).toBe(4)
    expect(sf.msRate()).toBe(48)

    sf.bits = 24
    expect(sf.sampleSize()).toBe(4) // 24-bit is carried in 4 bytes
    expect(sf.frameSize()).toBe(8)

    sf.bits = 32
    expect(sf.sampleSize()).toBe(4)

    sf.bits = 16
    sf.rate = 44100
    expect(sf.msRate()).toBeCloseTo(44.1)
    expect(sf.toString()).toBe('44100:16:2')
  })
})

describe('TimeProvider (median — regression for the numeric-sort fix)', () => {
  // A non-zero clock so setDiff takes the median branch (now() !== 0).
  const ctx = { currentTime: 1 } as unknown as ConstructorParameters<typeof TimeProvider>[0]

  it('picks the numeric median, not the lexicographic one', () => {
    const tp = new TimeProvider(ctx)
    // setDiff pushes (c2s - s2c) / 2; feed values 2, 10, -5, 100, 3.
    for (const v of [2, 10, -5, 100, 3]) tp.setDiff(2 * v, 0)
    // Numeric median of [-5, 2, 3, 10, 100] is 3.
    // A string sort would yield ["-5","10","100","2","3"] -> 100.
    expect(tp.diff).toBe(3)
  })

  it('serverTime applies the offset', () => {
    const tp = new TimeProvider(ctx)
    for (const v of [10, 20, 30]) tp.setDiff(2 * v, 0) // median 20
    expect(tp.diff).toBe(20)
    expect(tp.serverTime(1000)).toBe(1020)
  })
})

describe('PcmChunkMessage', () => {
  // Build a wire buffer: 26-byte base header + timestamp(8) + 4 ignored bytes,
  // then the PCM payload starting at offset 38.
  function makeChunk(sampleCount: number, sf: SampleFormat) {
    const header = 38
    const buf = new ArrayBuffer(header + sampleCount * 2)
    const v = new DataView(buf)
    v.setUint16(0, 2, true) // type: PCM
    v.setInt32(26, 7, true) // timestamp.sec
    v.setInt32(30, 500000, true) // timestamp.usec
    for (let i = 0; i < sampleCount; i++) v.setInt16(header + i * 2, i + 1, true)
    return new PcmChunkMessage(buf, sf)
  }

  it('exposes payload/frame counts and the decoded timestamp', () => {
    const sf = new SampleFormat() // frameSize 4 (2ch * 16bit)
    const chunk = makeChunk(8, sf) // 16 bytes -> 4 frames
    expect(chunk.payloadSize()).toBe(16)
    expect(chunk.getFrameCount()).toBe(4)
    expect(chunk.timestamp.sec).toBe(7)
    expect(chunk.timestamp.getMilliseconds()).toBe(7500)
  })

  it('reads frames sequentially until end of chunk', () => {
    const sf = new SampleFormat()
    const chunk = makeChunk(8, sf)
    const first = chunk.readFrames(2)
    expect(first.byteLength).toBe(8) // 2 frames * 4 bytes
    expect(chunk.idx).toBe(2)
    expect(chunk.isEndOfChunk()).toBe(false)
    chunk.readFrames(2)
    expect(chunk.isEndOfChunk()).toBe(true)
  })

  it('concatenates payloads byte-for-byte in addPayload', () => {
    const sf = new SampleFormat()
    const chunk = makeChunk(8, sf) // samples 1..8
    chunk.addPayload(new Int16Array([100, 200]).buffer)
    expect(chunk.payloadSize()).toBe(20)
    const out = new DataView(chunk.payload)
    expect(out.getInt16(0, true)).toBe(1) // original first sample preserved
    expect(out.getInt16(14, true)).toBe(8) // original last sample preserved
    expect(out.getInt16(16, true)).toBe(100) // appended
    expect(out.getInt16(18, true)).toBe(200)
  })
})
