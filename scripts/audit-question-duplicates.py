#!/usr/bin/env python3
"""Flag transcription duplicates for review; never merge distinct source records."""
from pathlib import Path
import collections, json, re, unicodedata
root=Path(__file__).resolve().parents[1]
bank=json.loads((root/'public/question-bank.json').read_text())
rows=bank['questions']+bank.get('reviewQueue',[])
def normalized(text):
    return ' '.join(re.findall(r'[a-z0-9]+',unicodedata.normalize('NFKC',text).lower()))
def content(q):
    return normalized(q['text'])+' | '+' | '.join(normalized(o['text']) for o in q['options'])
groups=collections.defaultdict(list)
contents={q['id']:content(q) for q in rows}
for q in rows:groups[contents[q['id']]].append(q)
exact=[[q['id'] for q in group] for group in groups.values() if len(group)>1]
tokens={q['id']:set(normalized(q['text']).split()) for q in rows}
likely=[]
for i,a in enumerate(rows):
    ta=tokens[a['id']]
    if len(ta)<12:continue
    for b in rows[i+1:]:
        if a['topic']!=b['topic'] or contents[a['id']]==contents[b['id']]:continue
        tb=tokens[b['id']]
        if min(len(ta),len(tb))/max(len(ta),len(tb))<.85:continue
        similarity=len(ta&tb)/len(ta|tb)
        if similarity>=.9:
            likely.append({'ids':[a['id'],b['id']],'stemTokenJaccard':round(similarity,4)})
report={'records':len(rows),'exactTranscriptionGroups':exact,'likelyStemPairs':likely,
        'method':'Exact normalized stem/options; likely pairs require same topic, at least 12 distinct stem tokens, token-count ratio >= 0.85 and Jaccard >= 0.90.',
        'limits':'These are review flags based on extracted text. Shared passages, equations and different figures can change meaning. No records were merged; original source references and IDs remain intact.'}
(root/'private-sources/converted/duplicate-audit.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
print(json.dumps({'records':len(rows),'exactTranscriptionGroups':len(exact),'likelyStemPairs':len(likely)}))
