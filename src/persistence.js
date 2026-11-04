import {fresh,restoreBackup,validateBank} from './model.js';
// Snapshot every referenced question so later edits to the bundled bank cannot
// silently change historical answers, source references, or an active session.
function referencedIds(state){
 return new Set([
  ...(state.attempts||[]).map(a=>a.questionId),
  ...(state.bookmarks||[]),
  ...Object.keys(state.reviews||{}),
  ...(state.sessions||[]).flatMap(s=>Array.isArray(s.entries)?s.entries.map(e=>e.questionId):[]),
 ]);
}
export function hydrate(saved,bank){
 const errors=validateBank(bank);if(errors.length)throw Error(errors.join('\n'));
 if(saved!==null&&saved!==undefined){
  if(typeof saved!=='object'||Array.isArray(saved)||![1,2].includes(saved.version)||
     !Array.isArray(saved.questions)||!Array.isArray(saved.attempts)||
     !Array.isArray(saved.sessions)||!Array.isArray(saved.bookmarks)||
     !saved.reviews||typeof saved.reviews!=='object'||Array.isArray(saved.reviews)||
     (saved.active!==null&&typeof saved.active!=='string'))throw Error('Invalid stored study data.');
  // Check duplicates and fields before the map merge can conceal corrupt records.
  const ownErrors=validateBank({version:1,questions:saved.questions});if(ownErrors.length)throw Error(ownErrors.join('\n'));
  if(saved.legacyUnverifiedQuestionIds!==undefined&&(!Array.isArray(saved.legacyUnverifiedQuestionIds)||saved.legacyUnverifiedQuestionIds.some(id=>typeof id!=='string')))throw Error('Invalid migration provenance.');
  if(saved.version===2){
   const snapshots=new Set(saved.questions.map(q=>q.id));
   if([...referencedIds(saved)].some(id=>!snapshots.has(id)))throw Error('A referenced question snapshot is missing. Restore a complete backup.');
  }
 }
 const defaults=new Map(bank.questions.map(q=>[q.id,q]));const merged=new Map(defaults);
 const pinnedQuestionIds=[];
 for(const q of saved?.questions||[]){
  const bundled=defaults.get(q.id);
  // A private correction to a known ID retains its original content and scoring.
  merged.set(q.id,bundled&&JSON.stringify(bundled)===JSON.stringify(q)?bundled:q);
  if(bundled&&JSON.stringify(bundled)!==JSON.stringify(q))pinnedQuestionIds.push(q.id);
 }
 const missingLegacy=saved?.version===1?[...referencedIds(saved)].filter(id=>!saved.questions.some(q=>q.id===id)):[];
 const value={...fresh(),...saved,version:2,questions:[...merged.values()],legacyUnverifiedQuestionIds:[...new Set([...(saved?.legacyUnverifiedQuestionIds||[]),...missingLegacy])],pinnedQuestionIds};
 const checked=restoreBackup(value);checked.questions=[...merged.values()];return checked;
}
export function personalData(state,bank){
 const defaults=new Map(bank.questions.map(q=>[q.id,q]));
 const referenced=referencedIds(state);
 return {...state,version:2,questions:state.questions.filter(q=>{
  const bundled=defaults.get(q.id);
  // Backup restoration and import clone records: identical content must also be
  // excluded, even when object identity differs from the bundled record.
  return referenced.has(q.id)||!bundled||(q!==bundled&&JSON.stringify(q)!==JSON.stringify(bundled));
 })};
}
// Keep a verified recovery copy before replacing a legacy record. Storage
// writes are atomic: on quota failure the original key remains unchanged.
export function saveHydrated(storage,key,raw,state,bank,now=Date.now()){
 const migrating=raw!==null&&JSON.parse(raw).version===1&&state.version===2;
 let created=null;
 if(migrating){
  try{
   let backup=null;
   for(let i=0;i<storage.length;i++){
    const candidate=storage.key(i);
    if(candidate?.startsWith('madar-before-v2-')&&storage.getItem(candidate)===raw){backup=candidate;break;}
   }
   if(!backup){
    backup=`madar-before-v2-${now}`;
    while(storage.getItem(backup)!==null)backup+='-copy';
    storage.setItem(backup,raw);created=backup;
    if(storage.getItem(backup)!==raw)throw Error('Backup verification failed.');
   }
  }catch(error){
   if(created)try{storage.removeItem(created);}catch{}
   throw Error('Migration paused: unable to save a recovery copy. Export raw data before freeing storage and retrying.');
  }
 }
 try{storage.setItem(key,JSON.stringify(personalData(state,bank)));}
 catch(error){
  if(created)try{storage.removeItem(created);}catch{}
  throw Error('Unable to save migrated data. Original stored data was preserved; export it and free storage before retrying.');
 }
}
export function studyDraft(state){return {...structuredClone({...state,questions:[]}),questions:state.questions};}

