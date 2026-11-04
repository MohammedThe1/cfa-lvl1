import {test} from 'node:test';
import assert from 'node:assert/strict';
import {dailyPlan,allocatePractice} from '../src/planning.js';
const qs=[{id:'a',topic:'A',module:'one'},{id:'b',topic:'A',module:'one'},{id:'c',topic:'B',module:'two'},{id:'d',topic:'B',module:'two'}];
test('daily plan prioritizes due reviews and least covered module',()=>{
 const now=Date.parse('2027-01-10T12:00:00Z');
 const p=dailyPlan(qs,[{questionId:'a'}],{a:{weak:true,due:now},b:{weak:true,due:now+1}},{minutes:30,examDate:'2027-02-01'},now);
 assert.deepEqual(p.due.map(q=>q.id),['a']); assert.equal(p.next.topic,'B'); assert.equal(p.practiceCount,5); assert.equal(p.days,22);
});
test('allocation rotates topics and selects unseen questions before repeats',()=>{
 const attempts=[{questionId:'a'},{questionId:'c'}];
 assert.deepEqual(allocatePractice(qs,attempts,3),['b','d','a']);
 assert.deepEqual(allocatePractice(qs,attempts,5,'B'),['d','c']);
});
test('mock allocation requires fresh questions and exact topic quotas', async()=>{
 const {allocateMock, MOCK_2027}=await import('../src/planning.js');
 const questions=Object.entries(MOCK_2027.session1).flatMap(([topic,n])=>Array.from({length:n},(_,i)=>({id:`${topic}-${i}`,topic})));
 const complete=allocateMock(questions,[], 'session1'); assert.equal(complete.ids.length,90); assert.deepEqual(complete.shortages,[]);
 const lacking=allocateMock(questions,[{entries:[{questionId:questions[0].id}]}],'session1'); assert.equal(lacking.ids.length,0); assert.equal(lacking.shortages[0].available,21);
});
test('mock excludes exact normalized content duplicates of seen questions and within pool', async()=>{
 const {allocateMock, MOCK_2027}=await import('../src/planning.js');
 const bank=Object.entries(MOCK_2027.session1).flatMap(([topic,n])=>Array.from({length:n},(_,i)=>({id:`${topic}-${i}`,topic,text:`Stem ${topic} ${i}`,options:[{text:'A'},{text:'B'}]})));
 const original=bank[0], alias={...original,id:'previous-alias',text:original.text.toUpperCase().replace(' ', '   ')};
 const result=allocateMock(bank,[{entries:[{questionId:alias.id}]}],'session1',[...bank,alias]);
 assert.equal(result.ids.length,0); assert.equal(result.shortages[0].available,21);
 const within=bank.map(q=>({...q})); within[1]={...within[1],text:within[0].text,options:within[0].options};
 assert.equal(allocateMock(within,[],'session1').shortages[0].available,21);
});
