import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createStore } from '../electron/store.mjs';
test('favorites and progress persist, signed streams and unrelated fields never persist', () => {
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-test-'));
  try {
    const store=createStore(folder), item={id:'7689844778497739800',title:'测试',episodes:195,cover:'',tags:[],url:'https://example.com/?token=secret'};
    assert.equal(store.favorite(item).favorites.length,1);
    store.progress({...item,episode:2,seconds:18.8});
    const read=createStore(folder).read();assert.equal(read.history[0].seconds,18);assert.equal(read.history[0].episode,2);assert.equal('url' in read.history[0],false);
    assert.equal(store.favorite(item).favorites.length,0);
    assert.throws(() => store.progress({...item,episode:2,seconds:NaN}));
    assert.equal(store.clearHistory().history.length,0);
  } finally {fs.rmSync(folder,{recursive:true,force:true});}
});
