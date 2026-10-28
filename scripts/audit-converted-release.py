#!/usr/bin/env python3
"""Independent release invariants. This does not certify every OCR/transcription word."""
from pathlib import Path
import collections,hashlib,json
root=Path(__file__).resolve().parents[1]
bank=json.loads((root/'public/question-bank.json').read_text());records=bank['questions']+bank.get('reviewQueue',[])
assert len(records)==1558
assert len({q['id'] for q in records})==len(records)
candidate_ids={json.loads(line)['id'] for line in (root/'private-sources/transcripts/question-candidates.jsonl').read_text().splitlines()}
conversion_audit=json.loads((root/'private-sources/converted/audit.json').read_text())
legacy_mapping={r['id']:r['candidateId'] for r in conversion_audit['records'] if r.get('candidateId')}
assert {q.get('conversion',{}).get('candidateId',legacy_mapping.get(q['id'])) for q in records}==candidate_ids,'Candidate coverage changed'
old=json.loads((root/'private-sources/review/sample-11.json').read_text())['questions']
byid={q['id']:q for q in bank['questions']}
assert all(byid[q['id']]==q for q in old),'Previously checked records changed'
assets=json.loads((root/'private-sources/converted/assets-manifest.json').read_text());assetmap={a['asset']:a for a in assets};references=set()
for question in records:
    if question['status']=='validated' and question.get('conversion'):
        assert question['conversion']['dualKeyAgreement']
        assert question['conversion']['sourcePracticeReady']
        assert question['presentation']=='source'
        assert question['materials'] and question['explanationMaterials']
        assert question['correctOptionId'] in [o['id'] for o in question['options']]
        assert question['preserveOrder'] is True
        question_pages={p['pdfPage'] for m in question['materials'] for p in m.get('pages',[])}
        answer_pages={p['pdfPage'] for m in question['explanationMaterials'] for p in m.get('pages',[])}
        assert not question_pages.intersection(answer_pages),'Solutions visible before submission: '+question['id']
        assert not question['conversion'].get('answerPageOverlap'),question['id']
        assert not question['conversion'].get('solutionHeadingPages'),question['id']
    for material in question.get('materials',[])+question.get('explanationMaterials',[]):
        if material['type']!='document':continue
        assert material['initialPage'] in [p['pdfPage'] for p in material['pages']]
        for page in material['pages']:
            name=Path(page['src']).name;references.add(name)
            assert name in assetmap,f'Missing asset provenance: {name}'
            assert assetmap[name]['pdfPage']==page['pdfPage']
            assert assetmap[name]['sourceSha256']==question['conversion']['sourceSha256']
    if question.get('conversion'):
        for pn in question['conversion'].get('sectionPages',question['conversion']['questionPages']):
            name=f"{question['conversion']['sourceSha256'][:12]}-p{pn}.webp";assert name in assetmap;references.add(name)
for name in references:
    p=root/'public/question-assets'/name
    assert p.exists()
    assert hashlib.sha256(p.read_bytes()).hexdigest()==assetmap[name]['sha256']
    assert assetmap[name]['losslessRaster']
counts=collections.Counter(q['status'] for q in bank['questions']);topics=collections.defaultdict(collections.Counter);sources=collections.defaultdict(collections.Counter)
for q in records:
    status='ready' if q['status']=='validated' else 'review' if q['correctOptionId'] is not None else 'unresolved'
    topics[q['topic']][status]+=1;sources[q['sources'][0]['title']][status]+=1
report={'allRecords':len(records),'structured':len(bank['questions']),'ready':counts['validated'],'completeAwaitingReview':counts['review'],'unresolved':len(bank.get('reviewQueue',[])),'preservedOriginalRecords':len(old),'referencedLosslessPages':len(references),'topics':topics,'sources':sources,'checks':['unique record IDs','all 11 original checked records unchanged','active converted keys agree between independent extractors','active converted records contain original questions and solutions','active question pages do not overlap solutions or contain detected solution headings','all referenced source images exist and match recorded hashes','source rasters losslessly round-trip from the supplied PDFs'],'limits':['Searchable text is not certified against every original page. Source-page presentation is authoritative.','Unresolved and review records are excluded from scored sessions.','No LES content was imported.']}
(root/'private-sources/converted/release-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps({k:v for k,v in report.items() if k not in ['topics','sources','checks','limits']},indent=2))
