import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../web/app.js', import.meta.url), 'utf8');
const render = source.slice(source.indexOf('function renderChart(){'), source.indexOf('function dayName('));
function chart(weeks, width, mode = 'week') {
  const element = { clientWidth: width, innerHTML: '' };
  runInNewContext(render + ';renderChart();', {
    state: { chart: mode, week: Math.max(...weeks), baseline: [5, 10, 20, 40, 60, 80, 98, 100], reports: weeks.map(week => ({ week, plan: 10, actual: 8 })) },
    $: () => element,
    document: { querySelectorAll: () => [] },
    fmt: String,
    icon: () => '',
  });
  const svgWidth = Number(element.innerHTML.match(/viewBox="0 0 ([0-9.]+)/)[1]);
  const ticks = [...element.innerHTML.matchAll(/<text x="([0-9.]+)"[^>]+>([MB][0-9]+)<\/text>/g)];
  for (let i = 1; i < ticks.length; i++) assert.ok(Number(ticks[i][1]) - Number(ticks[i - 1][1]) >= 48, 'Labels need readable spacing');
  assert.ok(element.innerHTML.includes('class="chart-scroll" tabindex="0"'));
  return { svgWidth, ticks };
}
const weeks = Array.from({ length: 14 }, (_, i) => i + 1);
for (const width of [256, 314, 564, 715, 1200]) {
  const result = chart(weeks, width);
  assert.equal(result.ticks.length, 14);
  assert.ok(result.svgWidth >= width);
  if (width < 800) assert.ok(result.svgWidth > width, 'Compact charts must scroll');
}
assert.equal(chart([13], 314).ticks.length, 1);
assert.equal(chart([1, 5, 14], 314).ticks.length, 3);
assert.equal(chart(weeks, 314, 'month').ticks.length, 8);
assert.equal(chart([519, 520], 120).ticks.length, 2);
console.log('PASS: readable weekly/monthly labels, single/sparse reports, horizontal width, keyboard focus');
