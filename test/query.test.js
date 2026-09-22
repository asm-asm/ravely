import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuery, translateQuery } from '../src/ravelry.js';

test('baby sweater translates with or without Japanese spacing', () => {
  for (const query of ['ベビーセーター', 'ベビー セーター', 'ベビー　セーター', 'ﾍﾞﾋﾞｰｾｰﾀｰ']) {
    assert.equal(translateQuery(normalizeQuery(query)), 'baby sweater');
  }
});
