import { describe, it, expect } from 'vitest';
import { repairJSON } from './gemini';

// ─────────────────────────────────────────────────────────────────────────────
// repairJSON
// ─────────────────────────────────────────────────────────────────────────────

describe('repairJSON', () => {
  it('returns valid JSON unchanged', () => {
    const valid = '{"name": "Alice", "age": 30}';
    expect(JSON.parse(repairJSON(valid))).toEqual({ name: 'Alice', age: 30 });
  });

  // ── Trailing commas ─────────────────────────────────────────────────────
  it('removes trailing comma before closing brace', () => {
    const input = '{"a": 1, "b": 2,}';
    expect(JSON.parse(repairJSON(input))).toEqual({ a: 1, b: 2 });
  });

  it('removes trailing comma before closing bracket', () => {
    const input = '[1, 2, 3,]';
    expect(JSON.parse(repairJSON(input))).toEqual([1, 2, 3]);
  });

  it('removes trailing comma with whitespace before closing brace', () => {
    const input = '{"a": 1, "b": 2 ,  }';
    expect(JSON.parse(repairJSON(input))).toEqual({ a: 1, b: 2 });
  });

  it('handles nested trailing commas', () => {
    const input = '{"speakers": [{"id": "s1",}, {"id": "s2",},]}';
    expect(JSON.parse(repairJSON(input))).toEqual({
      speakers: [{ id: 's1' }, { id: 's2' }],
    });
  });

  // ── Single-quoted strings ───────────────────────────────────────────────
  it('converts single-quoted property names to double-quoted', () => {
    const input = "{'name': 'Alice'}";
    expect(JSON.parse(repairJSON(input))).toEqual({ name: 'Alice' });
  });

  it('converts single-quoted values to double-quoted', () => {
    const input = '{"name": \'Alice\'}';
    expect(JSON.parse(repairJSON(input))).toEqual({ name: 'Alice' });
  });

  it('handles embedded double quotes inside single-quoted strings', () => {
    const input = "{'text': 'She said \"hello\"'}";
    expect(JSON.parse(repairJSON(input))).toEqual({ text: 'She said "hello"' });
  });

  // ── JS-style comments ──────────────────────────────────────────────────
  it('removes single-line comments', () => {
    const input = '{\n"a": 1, // this is a comment\n"b": 2\n}';
    expect(JSON.parse(repairJSON(input))).toEqual({ a: 1, b: 2 });
  });

  it('does not remove // inside a double-quoted string', () => {
    const input = '{"url": "https://example.com"}';
    expect(JSON.parse(repairJSON(input))).toEqual({ url: 'https://example.com' });
  });

  // ── Combined issues ────────────────────────────────────────────────────
  it('fixes trailing commas, single quotes, and comments together', () => {
    const input = `{
      'speakers': [
        {'id': 'speaker_1', 'name': 'Alice',}, // first speaker
        {'id': 'speaker_2', 'name': 'Bob',},
      ],
    }`;
    expect(JSON.parse(repairJSON(input))).toEqual({
      speakers: [
        { id: 'speaker_1', name: 'Alice' },
        { id: 'speaker_2', name: 'Bob' },
      ],
    });
  });

  // ── Realistic LLM response shape ──────────────────────────────────────
  it('repairs a realistic Gemini transcription response with trailing commas', () => {
    const input = `{
  "speakers": [
    {
      "id": "speaker_1",
      "label": "Speaker 1",
      "name": "John",
      "role": "Engineer",
      "company": "Acme",
      "timestamp": 0,
    },
    {
      "id": "speaker_2",
      "label": "Speaker 2",
      "name": "Jane",
      "role": "PM",
      "company": "Acme",
      "timestamp": 5.2,
    },
  ],
  "transcript": [
    {
      "id": "entry_1",
      "speakerId": "speaker_1",
      "text": "Hello everyone.",
      "startTime": 0,
      "endTime": 2.5,
    },
  ],
}`;
    const parsed = JSON.parse(repairJSON(input));
    expect(parsed.speakers).toHaveLength(2);
    expect(parsed.transcript).toHaveLength(1);
    expect(parsed.speakers[0].name).toBe('John');
  });

  it('does not corrupt commas inside string values', () => {
    const input = '{"text": "Hello, world,"}';
    expect(JSON.parse(repairJSON(input))).toEqual({ text: 'Hello, world,' });
  });
});
