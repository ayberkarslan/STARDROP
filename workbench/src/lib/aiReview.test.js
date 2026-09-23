import assert from 'node:assert/strict';
import test from 'node:test';
import { applyAiSuggestions, validateAiReview } from './aiReview.js';
import { newBoardProfile } from './boardProfile.js';

test('AI patches are schema validated and never auto-approved', () => {
  const profile = newBoardProfile({ mcuPart: 'STM32F401CCU6' });
  profile.connections = [{ componentRef: 'U1', role: 'SCL', mcuPin: 'PB8', peripheral: 'I2C1', approved: true }];
  const review = validateAiReview({ summary: 'PB6 doğru.', suggestions: [{ connectionIndex: 0, mcuPin: 'PB6', confidence: 90, reason: 'NET izi', evidence: 'NET: I2C1_SCL' }] }, 1);
  const applied = applyAiSuggestions(profile, review, ['ai-1']);
  assert.equal(applied.connections[0].mcuPin, 'PB6');
  assert.equal(applied.connections[0].approved, false);
  assert.equal(applied.audit.at(-1).type, 'AI_SUGGESTIONS_APPLIED');
});
