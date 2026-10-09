import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPreferences } from '../electron/preferences.mjs';
test('playback preferences persist; invalid input cannot corrupt saved settings',t=>{
  const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-settings-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
  const prefs=createPreferences(folder);assert.equal(prefs.read().theme,'system');assert.equal(prefs.read().autoplay,true);prefs.update({theme:'dark',autoplay:false,defaultSpeed:1.5,defaultMode:'window'});
  assert.equal(createPreferences(folder).read().defaultSpeed,1.5);assert.equal(createPreferences(folder).read().autoplay,false);
  for(const bad of [{defaultSpeed:100},{theme:'unknown'},{autoplay:'true'},{volume:NaN},{unknown:true}])assert.throws(()=>prefs.update(bad));assert.equal(createPreferences(folder).read().theme,'dark');
});

test('upgrade resets legacy layout once while preserving all other preferences and later choices',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-layout-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 const old=JSON.stringify({theme:'dark',defaultSpeed:1.5,volume:.4,defaultMode:'window'});fs.writeFileSync(path.join(folder,'preferences-v1.json'),old);
 const prefs=createPreferences(folder);assert.equal(prefs.read().defaultMode,'normal');assert.equal(prefs.read().defaultSpeed,1.5);assert.equal(prefs.read().theme,'dark');assert.equal(prefs.read().volume,.4);assert.equal(fs.readFileSync(path.join(folder,'preferences-v1.json'),'utf8'),old);
 prefs.update({defaultMode:'window'});assert.equal(createPreferences(folder).read().defaultMode,'window');
});

test('catalog layout defaults to grid, upgrades old settings and persists independently of playback',t=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'hongguo-catalog-'));t.after(()=>fs.rmSync(folder,{recursive:true,force:true}));
 fs.writeFileSync(path.join(folder,'preferences-v2.json'),JSON.stringify({theme:'dark',defaultSpeed:2,previewBeforePlay:false}));
 const prefs=createPreferences(folder);assert.equal(prefs.read().defaultCatalogLayout,'grid');assert.equal(prefs.read().theme,'dark');assert.equal(prefs.read().previewBeforePlay,false);
 prefs.update({defaultCatalogLayout:'list'});assert.equal(createPreferences(folder).read().defaultCatalogLayout,'list');assert.equal(createPreferences(folder).read().defaultSpeed,2);
 for(const value of ['rows','',false,null,1])assert.throws(()=>prefs.update({defaultCatalogLayout:value}));assert.equal(createPreferences(folder).read().defaultCatalogLayout,'list');
});
