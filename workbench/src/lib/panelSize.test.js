import assert from 'node:assert/strict';
import { test } from 'node:test';
import { panelWidth } from './panelSize.js';

test('panel sizing clamps saved and dragged widths and leaves working space', () => {
  assert.equal(panelWidth(null), 210);
  assert.equal(panelWidth('broken'), 210);
  assert.equal(panelWidth(Infinity), 210);
  assert.equal(panelWidth(120), 180);
  assert.equal(panelWidth(900), 520);
  assert.equal(panelWidth(400, { viewport: 650 }), 290);
  assert.equal(panelWidth(239.7), 240);
});
test('drawers have independent limits', () => {
  const options = { min: 300, max: 900, reserve: 24, fallback: 430 };
  assert.equal(panelWidth(null, options), 430);
  assert.equal(panelWidth(700, { ...options, viewport: 640 }), 616);
  assert.equal(panelWidth(50, options), 300);
});
