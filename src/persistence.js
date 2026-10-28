import {fresh,restoreBackup,validateBank} from './model.js';
// Bundled questions are immutable assets. Persist personal history and custom
// imports, keeping the source library out of the browser's small storage quota.
export function hydrate(saved,bank){
 const errors=validateBank(bank);if(errors.length)throw Error(errors.join('\n'));
 if(saved!==null&&saved!==undefined){
  if(typeof saved!=='object'||Array.isArray(saved)||saved.version!==1||
     !Array.isArray(saved.questions)||!Array.isArray(saved.attempts)||
     !Array.isArray(saved.sessions)||!Array.isArray(saved.bookmarks)||
     !saved.reviews||typeof saved.reviews!=='object'||Array.isArray(saved.reviews)||
     (saved.active!==null&&typeof saved.active!=='string'))throw Error('Invalid stored study data.');
  // Check duplicates and fields before the map merge can conceal corrupt records.
  const ownErrors=validateBank(saved);if(ownErrors.length)throw Error(ownErrors.join('\n'));
 }
 const defaults=new Map(bank.questions.map(q=>[q.id,q]));const merged=new Map(defaults);
 for(const q of saved?.questions||[]){
  const bundled=defaults.get(q.id);
  // A private correction to a known ID retains its original content and scoring.
  merged.set(q.id,bundled&&JSON.stringify(bundled)===JSON.stringify(q)?bundled:q);
 }
 const value={...fresh(),...saved,questions:[...merged.values()]};
 const checked=restoreBackup(value);checked.questions=[...merged.values()];return checked;
}
export function personalData(state,bank){
 const defaults=new Map(bank.questions.map(q=>[q.id,q]));
 return {...state,questions:state.questions.filter(q=>{
  const bundled=defaults.get(q.id);
  // Backup restoration and import clone records: identical content must also be
  // excluded, even when object identity differs from the bundled record.
  return !bundled||(q!==bundled&&JSON.stringify(q)!==JSON.stringify(bundled));
 })};
}
export function studyDraft(state){return {...structuredClone({...state,questions:[]}),questions:state.questions};}
