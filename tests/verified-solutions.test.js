import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasVerifiedSourceExplanation} from '../src/verified-solutions.js';

test('source feedback is limited to reviewed, unchanged question versions', () => {
  const bank = JSON.parse(readFileSync(new URL('../public/question-bank.json', import.meta.url)));
  const checked = bank.questions.filter(hasVerifiedSourceExplanation);
  assert.equal(checked.length, 20);
  const source = checked[0];
  for (const field of ['text', 'correctOptionId', 'explanation']) {
    const revised = structuredClone(source);
    revised[field] += ' changed';
    assert.equal(hasVerifiedSourceExplanation(revised), false, field);
  }
  const revised = structuredClone(source);
  revised.options[0].text += ' changed';
  assert.equal(hasVerifiedSourceExplanation(revised), false);
  revised.verifiedBy = 'Codex: direct text compared with rendered original pages';
  assert.equal(hasVerifiedSourceExplanation(revised), false);
  const changedMaterial = structuredClone(source);
  changedMaterial.materials = [...changedMaterial.materials, {type:'passage', text:'Changed context'}];
  assert.equal(hasVerifiedSourceExplanation(changedMaterial), false);
  assert.equal(hasVerifiedSourceExplanation(bank.questions.find(q => q.id === 'schweser-17f6dfc8a2a4-m1-s1-q1')), false);
});
