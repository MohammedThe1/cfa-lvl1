import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,startSession,select,submit,toggleBookmark,validateBank} from '../src/model.js';
import {hydrate,personalData,studyDraft} from '../src/persistence.js';
import {fixture} from './fixtures.js';

const bundle=()=>({version:1,questions:[fixture('old'),fixture('new')]});

test('compact persistence keeps attempts and reloads bundled records without storing them',()=>{
 const bank=bundle();const state=hydrate(null,bank);
 startSession(state,['old'],'practice','__LABEL__',100);
 select(state,'option-y',101);submit(state,102);toggleBookmark(state,'old');
 const saved=personalData(state,bank);
 assert.deepEqual(saved.questions,[]);
 const reloaded=hydrate(JSON.parse(JSON.stringify(saved)),bank);
 assert.equal(reloaded.questions.length,2);
 assert.equal(reloaded.questions[0],bank.questions[0]);
 assert.deepEqual(reloaded.attempts,state.attempts);
 assert.deepEqual(reloaded.sessions,state.sessions);
 assert.deepEqual(reloaded.bookmarks,['old']);
});

test('older backup is hydrated with new bundled records and compacts cloned defaults',()=>{
 const bank=bundle();const older=hydrate(null,{version:1,questions:[bank.questions[0]]});
 startSession(older,['old'],'lesson','__LABEL__',100);select(older,'option-y',101);submit(older,102);
 const restored=hydrate(JSON.parse(JSON.stringify(older)),bank);
 assert.equal(restored.questions.length,2);
 assert.deepEqual(restored.attempts,older.attempts);
 assert.deepEqual(personalData(structuredClone(restored),bank).questions,[]);
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
