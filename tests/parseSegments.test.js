/**
 * Tests for parseSegments() — the markdown-to-segment parser
 * from src/pipeline/preprocess.js
 *
 * parseSegments is a pure function (string → array) with no DOM dependencies,
 * making it an ideal target for unit tests.
 */

import { describe, it, expect } from 'vitest';
import { parseSegments } from '../src/pipeline/preprocess.js';

// ── Headings ─────────────────────────────────────────────────────────────────

describe('parseSegments — headings', () => {
    it('parses h1 headings', () => {
        const segs = parseSegments('# Hello World');
        expect(segs).toEqual([{ type: 'heading1', text: 'Hello World' }]);
    });

    it('parses h2 headings', () => {
        const segs = parseSegments('## Sub Heading');
        expect(segs).toEqual([{ type: 'heading2', text: 'Sub Heading' }]);
    });

    it('parses h3 headings', () => {
        const segs = parseSegments('### Details');
        expect(segs).toEqual([{ type: 'heading3', text: 'Details' }]);
    });

    it('trims heading text', () => {
        const segs = parseSegments('#   Padded   ');
        expect(segs[0].text).toBe('Padded');
    });

    it('handles multiple heading levels in sequence', () => {
        const md = '# Title\n## Section\n### Sub';
        const segs = parseSegments(md);
        expect(segs).toHaveLength(3);
        expect(segs.map(s => s.type)).toEqual(['heading1', 'heading2', 'heading3']);
    });
});

// ── Code Blocks ──────────────────────────────────────────────────────────────

describe('parseSegments — code blocks', () => {
    it('parses a fenced code block with language', () => {
        const md = '```python\nprint("hello")\n```';
        const segs = parseSegments(md);
        expect(segs).toEqual([
            { type: 'code', lang: 'python', content: 'print("hello")' },
        ]);
    });

    it('parses a fenced code block without language', () => {
        const md = '```\nsome code\n```';
        const segs = parseSegments(md);
        expect(segs).toEqual([
            { type: 'code', lang: '', content: 'some code' },
        ]);
    });

    it('preserves multi-line code content', () => {
        const md = '```js\nconst a = 1;\nconst b = 2;\nconsole.log(a + b);\n```';
        const segs = parseSegments(md);
        expect(segs[0].content).toBe('const a = 1;\nconst b = 2;\nconsole.log(a + b);');
    });

    it('handles empty code blocks', () => {
        const md = '```\n```';
        const segs = parseSegments(md);
        expect(segs[0]).toEqual({ type: 'code', lang: '', content: '' });
    });

    it('removes duplicate language label paragraph before code block', () => {
        // Claude/Gemini scrapers sometimes emit: "python\n\n```python\n..."
        const md = 'python\n\n```python\nprint("hello")\n```';
        const segs = parseSegments(md);
        // The duplicate "python" paragraph should be removed
        const types = segs.map(s => s.type);
        expect(types).not.toContain('paragraph');
        expect(segs.some(s => s.type === 'code' && s.lang === 'python')).toBe(true);
    });

    it('flushes unclosed code blocks at end of input', () => {
        const md = '```python\nprint("oops")';
        const segs = parseSegments(md);
        expect(segs[0]).toEqual({ type: 'code', lang: 'python', content: 'print("oops")' });
    });
});

// ── Lists ────────────────────────────────────────────────────────────────────

describe('parseSegments — bullet lists', () => {
    it('parses dash bullets', () => {
        const md = '- item one\n- item two';
        const segs = parseSegments(md);
        expect(segs).toEqual([
            { type: 'bullet', text: 'item one' },
            { type: 'bullet', text: 'item two' },
        ]);
    });

    it('parses asterisk bullets', () => {
        const md = '* first\n* second';
        const segs = parseSegments(md);
        expect(segs.every(s => s.type === 'bullet')).toBe(true);
    });

    it('parses plus bullets', () => {
        const md = '+ alpha\n+ beta';
        const segs = parseSegments(md);
        expect(segs.every(s => s.type === 'bullet')).toBe(true);
    });

    it('handles indented bullet items', () => {
        const md = '  - indented item';
        const segs = parseSegments(md);
        expect(segs[0]).toEqual({ type: 'bullet', text: 'indented item' });
    });
});

describe('parseSegments — numbered lists', () => {
    it('parses numbered list items', () => {
        const md = '1. first\n2. second\n3. third';
        const segs = parseSegments(md);
        expect(segs).toEqual([
            { type: 'numbered', n: 1, text: 'first' },
            { type: 'numbered', n: 2, text: 'second' },
            { type: 'numbered', n: 3, text: 'third' },
        ]);
    });

    it('handles non-sequential numbering', () => {
        const md = '5. fifth item\n10. tenth item';
        const segs = parseSegments(md);
        expect(segs[0].n).toBe(5);
        expect(segs[1].n).toBe(10);
    });
});

// ── Tables ───────────────────────────────────────────────────────────────────

describe('parseSegments — GFM tables', () => {
    it('parses a standard GFM pipe table', () => {
        const md = '| Name | Age |\n|------|-----|\n| Alice | 30 |\n| Bob | 25 |';
        const segs = parseSegments(md);
        expect(segs).toHaveLength(1);
        expect(segs[0].type).toBe('table');
        expect(segs[0].header).toEqual(['Name', 'Age']);
        expect(segs[0].rows).toEqual([
            ['Alice', '30'],
            ['Bob', '25'],
        ]);
    });

    it('handles single-row tables', () => {
        const md = '| Col A | Col B |\n|-------|-------|\n| val1 | val2 |';
        const segs = parseSegments(md);
        expect(segs[0].rows).toHaveLength(1);
    });
});

// ── Blockquotes ──────────────────────────────────────────────────────────────

describe('parseSegments — blockquotes', () => {
    it('parses blockquotes', () => {
        const segs = parseSegments('> This is a quote');
        expect(segs).toEqual([{ type: 'blockquote', text: 'This is a quote' }]);
    });

    it('handles blockquote without space after >', () => {
        const segs = parseSegments('>No space');
        expect(segs[0].type).toBe('blockquote');
        expect(segs[0].text).toBe('No space');
    });
});

// ── HR / Break / Paragraph ───────────────────────────────────────────────────

describe('parseSegments — hr, breaks, paragraphs', () => {
    it('parses horizontal rules', () => {
        const segs = parseSegments('---');
        expect(segs).toEqual([{ type: 'hr' }]);
    });

    it('parses long horizontal rules', () => {
        const segs = parseSegments('----------');
        expect(segs).toEqual([{ type: 'hr' }]);
    });

    it('parses blank lines as breaks', () => {
        const segs = parseSegments('hello\n\nworld');
        expect(segs[1].type).toBe('break');
    });

    it('deduplicates consecutive breaks', () => {
        const segs = parseSegments('hello\n\n\n\nworld');
        const breaks = segs.filter(s => s.type === 'break');
        expect(breaks.length).toBe(1);
    });

    it('parses plain text as paragraphs', () => {
        const segs = parseSegments('Just some text');
        expect(segs).toEqual([{ type: 'paragraph', text: 'Just some text' }]);
    });
});

// ── Mixed Content ────────────────────────────────────────────────────────────

describe('parseSegments — mixed content', () => {
    it('handles a realistic AI response', () => {
        const md = [
            '## How to use Python',
            '',
            'Here is an example:',
            '',
            '```python',
            'print("Hello, World!")',
            '```',
            '',
            'Key points:',
            '',
            '- Easy to learn',
            '- Great community',
            '- Lots of libraries',
            '',
            '| Feature | Rating |',
            '|---------|--------|',
            '| Syntax | 5/5 |',
            '| Speed | 3/5 |',
        ].join('\n');

        const segs = parseSegments(md);
        const types = segs.map(s => s.type);

        expect(types).toContain('heading2');
        expect(types).toContain('paragraph');
        expect(types).toContain('code');
        expect(types).toContain('bullet');
        expect(types).toContain('table');
    });
});
