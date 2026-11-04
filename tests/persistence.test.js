import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,startSession,select,submit,toggleBookmark,validateBank} from '../src/model.js';
import {hydrate,personalData,studyDraft,saveHydrated} from '../src/persistence.js';
import {fixture} from './fixtures.js';

const bundle=()=>({version:1,questions:[fixture('old'),fixture('new')]});

test('persistence snapshots referenced questions and reloads progress',()=>{
 const bank=bundle();const state=hydrate(null,bank);
 startSession(state,['old'],'practice','__LABEL__',100);
 select(state,'option-y',101);submit(state,102);toggleBookmark(state,'old');
 const saved=personalData(state,bank);
 assert.deepEqual(saved.questions.map(q=>q.id),['old']);
 assert.equal(saved.version,2);
 const reloaded=hydrate(JSON.parse(JSON.stringify(saved)),bank);
 assert.equal(reloaded.questions.length,2);
 assert.equal(reloaded.questions[0],bank.questions[0]);
 assert.deepEqual(reloaded.attempts,state.attempts);
 assert.deepEqual(reloaded.sessions,state.sessions);
 assert.deepEqual(reloaded.bookmarks,['old']);
});

test('older complete backup is hydrated with new bundled records and retains snapshots',()=>{
 const bank=bundle();const older=hydrate(null,{version:1,questions:[bank.questions[0]]});
 startSession(older,['old'],'lesson','__LABEL__',100);select(older,'option-y',101);submit(older,102);
 older.version=1;
 const restored=hydrate(JSON.parse(JSON.stringify(older)),bank);
 assert.equal(restored.questions.length,2);
 assert.equal(restored.version,2);
 assert.deepEqual(restored.legacyUnverifiedQuestionIds,[]);
 assert.deepEqual(restored.attempts,older.attempts);
 assert.deepEqual(personalData(structuredClone(restored),bank).questions.map(q=>q.id),['old']);
});

test('version 1 compact data migrates without changing history and flags missing provenance',()=>{
 const bank=bundle(), state=hydrate(null,bank);
 startSession(state,['old','new'],'timed','test',100,1);
 select(state,'option-y',101);toggleBookmark(state,'old');
 state.reviews.old={weak:true,due:500,streak:1};
 const legacy={...structuredClone(state),version:1,questions:[]};
 delete legacy.legacyUnverifiedQuestionIds; delete legacy.pinnedQuestionIds;
 const original=JSON.stringify(legacy), restored=hydrate(legacy,bank);
 assert.equal(JSON.stringify(legacy),original);
 assert.equal(restored.version,2);
 assert.deepEqual(restored.sessions,legacy.sessions);
 assert.deepEqual(restored.reviews,legacy.reviews);
 assert.deepEqual(restored.bookmarks,legacy.bookmarks);
 assert.equal(restored.active,legacy.active);
 assert.deepEqual(new Set(restored.legacyUnverifiedQuestionIds),new Set(['old','new']));
 const saved=personalData(restored,bank);
 assert.deepEqual(new Set(saved.questions.map(q=>q.id)),new Set(['old','new']));
 assert.deepEqual(hydrate(JSON.parse(JSON.stringify(saved)),bank).sessions,legacy.sessions);
});

test('snapshot protects history from changed bundled content and requires a new revision',()=>{
 const bank=bundle(), state=hydrate(null,bank);
 startSession(state,['old'],'practice','practice',100);
 select(state,'option-y',101);submit(state,102);toggleBookmark(state,'old');
 const saved=JSON.parse(JSON.stringify(personalData(state,bank)));
 const changed=structuredClone(bank);changed.questions[0].correctOptionId='option-x';
 changed.questions[0].text='Changed text';changed.questions[0].sources[0].location='New location';
 const restored=hydrate(saved,changed);
 assert.deepEqual(restored.attempts,state.attempts);
 assert.deepEqual(restored.sessions,state.sessions);
 assert.deepEqual(restored.bookmarks,state.bookmarks);
 assert.deepEqual(restored.reviews,state.reviews);
 assert.deepEqual(restored.questions.find(q=>q.id==='old'),bank.questions[0]);
 assert.deepEqual(restored.pinnedQuestionIds,['old']);
 const broken=structuredClone(saved);broken.questions=[];
 assert.throws(()=>hydrate(broken,changed),/snapshot is missing/);
});

test('legacy compact data conflicting with current bank fails safely without rescoring',()=>{
 const bank=bundle(), state=hydrate(null,bank);
 startSession(state,['old'],'practice','practice',100);
 select(state,'option-y',101);submit(state,102);
 const legacy={...structuredClone(state),version:1,questions:[]};
 const changed=structuredClone(bank);changed.questions[0].correctOptionId='option-x';
 const before=JSON.stringify(legacy);
 assert.throws(()=>hydrate(legacy,changed),/Invalid attempt history/);
 assert.equal(JSON.stringify(legacy),before);
});

test('migration keeps a verified backup and quota failures do not replace the original',()=>{
 const bank=bundle(), state=hydrate(null,bank);
 startSession(state,['old'],'practice','practice',100);select(state,'option-y',101);submit(state,102);
 const legacy={...structuredClone(state),version:1,questions:[]};
 const raw=JSON.stringify(legacy), migrated=hydrate(legacy,bank), key='madar-study-v1';
 const map=new Map([[key,raw]]);
 const storage={get length(){return map.size},key(i){return [...map.keys()][i]??null},getItem(k){return map.get(k)??null},setItem(k,v){if(this.fail===k)throw Error('quota');map.set(k,String(v))},removeItem(k){map.delete(k)}};
 storage.fail=key;
 assert.throws(()=>saveHydrated(storage,key,raw,migrated,bank,123),/Original stored data was preserved/);
 assert.equal(storage.getItem(key),raw);
 assert.equal(storage.length,1);
 assert.throws(()=>saveHydrated(storage,key,raw,migrated,bank,124));
 assert.equal(storage.length,1);
 storage.fail=null;
 saveHydrated(storage,key,raw,migrated,bank,125);
 assert.equal(storage.getItem('madar-before-v2-125'),raw);
 assert.equal(JSON.parse(storage.getItem(key)).version,2);
 assert.deepEqual(hydrate(JSON.parse(storage.getItem(key)),bank).attempts,state.attempts);
 // If a previous identical backup exists, retry reuses it without consuming quota.
 storage.setItem(key,raw);storage.fail=key;
 assert.throws(()=>saveHydrated(storage,key,raw,migrated,bank,126));
 assert.equal(storage.getItem('madar-before-v2-125'),raw);
 assert.equal(storage.length,2);
});

test('personal imports and edited records survive compact round trip',()=>{
 const bank=bundle();const state=hydrate(null,bank);
 const custom=fixture('custom');state.questions.push(custom);
 state.questions[0]=structuredClone(state.questions[0]);state.questions[0].text+=' __PRIVATE_CORRECTION__';
 const saved=personalData(state,bank);
 assert.deepEqual(saved.questions.map(q=>q.id),['old','custom']);
 const restored=hydrate(JSON.parse(JSON.stringify(saved)),bank);
 assert.equal(restored.questions.length,3);
 assert.equal(restored.questions[0].text,state.questions[0].text);
 assert.equal(restored.questions[2].id,'custom');
});

test('malformed compact state is rejected instead of resetting existing history',()=>{
 const bank=bundle();
 for(const corrupt of [{},[],{...fresh(),questions:[fixture('same'),fixture('same')]},{...fresh(),attempts:[{id:'dangling'}]}, {...fresh(),active:3}])assert.throws(()=>hydrate(corrupt,bank));
 const saved={...fresh(),bookmarks:['missing']};
 assert.throws(()=>hydrate(saved,bank));
 assert.deepEqual(saved.bookmarks,['missing']);
});

test('study draft isolates mutable history while sharing immutable library',()=>{
 const state=hydrate(null,bundle());startSession(state,['old'],'practice','__LABEL__',100);
 const draft=studyDraft(state);select(draft,'option-y',101);submit(draft,102);
 assert.equal(draft.questions,state.questions);
 assert.equal(state.attempts.length,0);assert.equal(draft.attempts.length,1);
 assert.equal(state.sessions[0].entries[0].selected,null);
});

test('source documents validate local assets and reject exposed solution pages',()=>{
 const q=fixture('source-q1',true);q.presentation='source';q.conversion={candidateId:'source-q1'};
 q.materials=[{id:'original-question',type:'document',title:'__QUESTION__',initialPage:1,pages:[{pdfPage:1,src:'question-assets/0123456789ab-p1.webp'}]}];
 q.explanationMaterials=[{id:'original-answer',type:'document',title:'__SOLUTION__',initialPage:2,pages:[{pdfPage:2,src:'question-assets/0123456789ab-p2.webp'}]}];
 q.requiredMaterialIds=['original-question'];
 assert.deepEqual(validateBank({version:1,questions:[q]}),[]);
 const leaked=structuredClone(q);leaked.materials[0].pages.push(leaked.explanationMaterials[0].pages[0]);
 assert.ok(validateBank({version:1,questions:[leaked]}).some(e=>e.includes('solution pages')));
 const remote=structuredClone(q);remote.materials[0].pages[0].src='https://example.com/source.png';
 assert.ok(validateBank({version:1,questions:[remote]}).length);
 const malformed=structuredClone(q);malformed.explanationMaterials={};
 assert.ok(validateBank({version:1,questions:[malformed]}).length);
});

