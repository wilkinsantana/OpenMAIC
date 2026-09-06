import { describe, expect, it } from 'vitest';
import { parse, type DefaultTreeAdapterTypes } from 'parse5';
import { repairWidgetConfigJson } from '@/lib/interactive/exercise-support';

describe('repairWidgetConfigJson', () => {
  it('preserves the JSON value while preventing embedded markup from ending its script', () => {
    const config = {
      type: 'code',
      solution: 'return `</script><script>alert(1)</script>`;',
      hints: ['a < b & c > d'],
      nested: [{ value: '\\"}]' }],
    };
    const html = `<html><script id="widget-config" type="application/json">${JSON.stringify(config)}</script><p>After</p></html>`;
    const fixed = repairWidgetConfigJson(html);
    const tree = parse(fixed);
    const scripts: string[] = [];
    function walk(node: DefaultTreeAdapterTypes.Node) {
      if ('tagName' in node && node.tagName === 'script')
        scripts.push(node.childNodes.map((n) => ('value' in n ? n.value : '')).join(''));
      if ('childNodes' in node) for (const child of node.childNodes) walk(child);
    }
    walk(tree);
    expect(scripts).toHaveLength(1);
    expect(JSON.parse(scripts[0])).toEqual(config);
    expect(fixed).toContain('<p>After</p>');
    expect(repairWidgetConfigJson(fixed)).toBe(fixed);
  });
  it.each([
    '<script id="widget-config" type="application/json">{"solution":"broken}</script>',
    '<script id="widget-config" type="application/json">{"type":"code"}<p>unexpected</p></script>',
    '<script>const unrelated = { solution: "text" };</script>',
  ])('leaves malformed or unrelated content unchanged', (html) => {
    expect(repairWidgetConfigJson(html)).toBe(html);
  });
});
