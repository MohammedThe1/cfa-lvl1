#!/usr/bin/env python3
"""Source-bound conversion. Never solves questions or fabricates missing material."""
import argparse,collections,hashlib,json,re,subprocess,unicodedata
from pathlib import Path
import pymupdf
ROOT=Path(__file__).resolve().parents[1]
TOPICS={'FIXED INCOME':'Fixed Income','ETHICAL AND PROFESSIONAL STANDARDS':'Ethical and Professional Standards','PORTFOLIO CONSTRUCTION':'Portfolio Management','PORTFOLIO MANAGEMENT':'Portfolio Management','CORPORATE FINANCE':'Corporate Issuers','ALTERNATIVE INVESTMENTS':'Alternative Investments','DERIVATIVES':'Derivatives','FINANCIAL STATEMENT ANALYSIS':'Financial Statement Analysis','EQUITIES':'Equity Investments','ECONOMICS':'Economics','QUANTITATIVE METHODS':'Quantitative Methods'}
def clean(s):
    s=re.sub(r'\u00ad\s*','',s)
    return re.sub(r'\s+',' ',s).strip()
def norm(s):return re.sub(r'\s+','',unicodedata.normalize('NFKC',re.sub(r'\u00ad\s*','',s)))
def markers(text,pattern):
    ms=list(re.finditer(pattern,text,re.M));return [(m,text[m.end():ms[i+1].start() if i+1<len(ms) else len(text)]) for i,m in enumerate(ms)]
def source_letter(s):
    patterns=[r'^(?:(?:Answer|Choice|Option)\s+)?([A-D])\s+is\s+(?:the\s+)?(?:correct|best)',r'^The correct (?:answer|response|choice)\s*(?:is|:)\s*[“"\(]?([A-D])\b',r'^([A-D])\.\s']
    for p in patterns:
        m=re.match(p,clean(s),re.I)
        if m and not re.match(r'\s*(?:and|or|,|/)\s*[A-D]\b',clean(s)[m.end():],re.I):return m[1].upper(),m.group(0)
    return None,None

def has_solution_heading(text):
    """Full source pages shown before answering must not contain printed keys.

    Test complete PDF text, including text that the transcription cleanup drops.
    A heading is required so a question merely discussing solutions is retained.
    """
    pattern=r'(?im)^\s*(?:ANSWER\s+KEY(?:\s+FOR\s+MODULE\s+QUIZZES)?|SOLUTIONS|ANSWERS(?:\s+TO\s+(?:PRACTICE\s+PROBLEMS|MODULE\s+QUIZZES))?)\s*$'
    return bool(re.search(pattern,text))

def answer_maps(text,category,candidates):
    text=text.replace('\f','\n')
    groups={}
    if category=='curriculum':
        for m,t in markers(text,r'^[ \t]*(\d+)\.(?:[ ]*\t[ \t]*|[ ]+(?=\S))'):
            letter,evidence=source_letter(t)
            if letter:groups.setdefault('Practice Problems',{}).setdefault(int(m[1]),(letter,t,m.start(),m.end()+len(t),evidence))
    else:
        sections=markers(text,r'^[ \t]*Module Quiz[ \t]+(\d+[^\n]*)\n')
        # Some source answer keys omit the quiz heading. Match only a single quiz
        # within this exact reading, with exact contiguous numbering and key count.
        if not sections and len(set(q['quiz'] for q in candidates))==1:
            start=text.find('ANSWER KEY FOR MODULE QUIZZES')
            if start>=0:sections=[(None,text[start+len('ANSWER KEY FOR MODULE QUIZZES'):])]
        for hm,t in sections:
            quiz='Module Quiz '+clean(hm[1]) if hm else candidates[0]['quiz']
            base=hm.end() if hm else text.find('ANSWER KEY FOR MODULE QUIZZES')+len('ANSWER KEY FOR MODULE QUIZZES')
            # Use the strongest printed marker available. Optional numbering
            # would also treat prose such as "A measure of profit" as a key.
            # Accept a letter at EOL for formula/image-only source explanations.
            key_end=r'(?:[ \t]+|(?=\n|$))'
            numbered=r'^[ \t]*\d+\.[ \t]+([A-D])'+key_end
            dotted=r'^[ \t]*\.[ \t]*([A-D])'+key_end
            numbered_style=bool(re.search(numbered,t,re.M))
            pat=numbered if numbered_style else dotted if re.search(dotted,t,re.M) else r'^[ \t]*([A-D])'+key_end
            entries=markers(t,pat);same=[q for q in candidates if clean(q['quiz'])==quiz]
            printed_numbers=[int(re.match(r'[ \t]*(\d+)',m[0])[1]) for m,_ in entries] if numbered_style else list(range(1,len(entries)+1))
            if len(entries)==len(same) and [q['number'] for q in same]==printed_numbers==list(range(1,len(same)+1)):
                groups[quiz]={i+1:(m[1],text,base+m.start(),base+m.end()+len(text),m.group(0).strip()) for i,(m,text) in enumerate(entries)}
    return groups

class Source:
    def __init__(self,b,folder):
        if hashlib.sha256(Path(b['path']).read_bytes()).hexdigest()!=b['sha256']:raise ValueError('Original source fingerprint changed: '+b['file'])
        self.meta=b;self.folder=folder;self.doc=pymupdf.open(b['path']);self.page_text={};self.lines={};self.offsets={};self.features={}
    def page(self,n):
        if n not in self.page_text:
            p=self.doc[n-1];parts=[];boxes=[]
            for block in p.get_text('dict')['blocks']:
                for line in block.get('lines',[]):
                    x0,y0,x1,y1=line['bbox']
                    if y1<48 or y0>p.rect.height-28:continue
                    t=''.join(sp['text'] for sp in line['spans'])
                    if t.strip().startswith('© CFA Institute.'):continue
                    parts.append(t);boxes.append({'text':t,'rect':[x0,y0,x1,y1],'sizes':[sp['size'] for sp in line['spans']]})
            self.page_text[n]='\n'.join(parts)+'\n';self.lines[n]=boxes
        return self.page_text[n]
    def span(self,start,end):
        text='';mapping=[]
        for n in range(start,end+1):
            t=self.page(n);mapping.append((len(text),len(text)+len(t),n));text+=t+'\n'
        return text,mapping
    def pages(self,mapping,a,b):return [n for lo,hi,n in mapping if hi>a and lo<b]
    def risky(self,pages):
        # Conservative page-level gate: do not auto-approve visually rich pages.
        for n in pages:
            p=self.doc[n-1]
            if p.get_drawings():return True
            for image in p.get_image_info():
                rect=pymupdf.Rect(image['bbox'])
                if rect.width>55 or rect.height>55:return True
            for line in self.lines.get(n,[]):
                sizes=line['sizes']
                if sizes and min(sizes)<8:return True
        return False

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',type=Path,default=ROOT/'private-sources/converted');args=ap.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    inventory=json.loads((ROOT/'private-sources/review/inventory.json').read_text());transcript=ROOT/'private-sources/transcripts';rows=[json.loads(l) for l in (transcript/'question-candidates.jsonl').read_text().splitlines()]
    old=json.loads((ROOT/'private-sources/review/sample-11.json').read_text())['questions'];questions=list(old);unresolved=[];audits=[];coverage=[];reason_counts=collections.Counter()
    for b in inventory:
        folder=transcript/(b['category']+'-'+b['sha256'][:12]);src=Source(b,folder)
        independent=args.output/(b['sha256'][:12]+'-independent.txt')
        if not independent.exists():subprocess.run(['pdftotext','-layout',b['path'],str(independent)],check=True)
        independent_text=norm(independent.read_text())
        for mi,module in enumerate(b['modules']):
            if module.get('recordType')=='appendix' or 'Appendices A-E' in module['title']:continue
            candidates=[q for q in rows if q['sourceFile']==b['file'] and q['module']==module['title']]
            if not candidates:continue
            end=b['modules'][mi+1]['pdfStart']-1 if mi+1<len(b['modules']) else len(src.doc)
            glossary=[p-1 for _,name,p in b['toc'] if p>module['pdfStart'] and name in ['Glossary','Index','Formulas','Appendix','Appendices']]
            if glossary:end=min([end]+glossary)
            ansstart=min(module['answerPages']) if module['answerPages'] else None
            answers,amap=src.span(ansstart,end) if ansstart else ('',[])
            parsed=answer_maps(answers,b['category'],candidates)
            answer_groups={quiz:{num:(letter,t,src.pages(amap,start,stop),key) for num,(letter,t,start,stop,key) in entries.items()} for quiz,entries in parsed.items()}
            independent_answers=args.output/(b['sha256'][:12]+f'-m{mi+1}-answers-layout.txt')
            if ansstart and not independent_answers.exists():subprocess.run(['pdftotext','-f',str(ansstart),'-l',str(end),'-layout',b['path'],str(independent_answers)],check=True)
            secondary=answer_maps(independent_answers.read_text() if independent_answers.exists() else '',b['category'],candidates)
            converted=active=0
            for original in candidates:
                issues=[];qid=original['id'];quiz=clean(original['quiz']);num=original['number'];linked=answer_groups.get(quiz,{}).get(num)
                # Re-segment the clean section text, preserving raw originals outside the application bank.
                ps=original['pdfPages'];section,pm=src.span(min(ps),max(ps))
                if b['category']=='curriculum':
                    contentstart=section.find('PRACTICE PROBLEMS');sectionstart=contentstart+len('PRACTICE PROBLEMS') if contentstart>=0 else 0;section=section[sectionstart:]
                else:
                    match=re.search(r'^MODULE QUIZ[ \t]+'+re.escape(quiz.removeprefix('Module Quiz '))+r'\s*\n',section,re.M)
                    sectionstart=match.end() if match else 0;section=section[sectionstart:]
                    stop=re.search(r'^(?:KEY CONCEPTS|ANSWER KEY FOR MODULE QUIZZES|MODULE QUIZ\s+\d|MODULE\s+\d+\.\d+)',section,re.M)
                    if stop:section=section[:stop.start()]
                # Use the same increasing-question rule, leaving nested numbered lists inside their parent.
                qm=[];last=0
                for m in re.finditer(r'(?m)^[ \t]*(\d+)\.(?:[ ]*\t[ \t]*|[ ]+(?=\S))',section):
                    if last<int(m[1])<=300:qm.append(m);last=int(m[1])
                found=next((i for i,m in enumerate(qm) if int(m[1])==num),None)
                if found is None:issues.append('question boundary not found after header cleanup');raw=original['rawText'];qpages=ps
                else:
                    marker=qm[found];finish=qm[found+1].start() if found+1<len(qm) else len(section)
                    raw=section[marker.end():finish];qpages=src.pages(pm,sectionstart+marker.start(),sectionstart+finish)
                opts=list(re.finditer(r'(?m)^[ \t]*([A-D])\.[ \t]+',raw));options=[]
                for oi,o in enumerate(opts):options.append({'id':o[1],'text':clean(raw[o.end():opts[oi+1].start() if oi+1<len(opts) else len(raw)])})
                stem=clean(raw[:opts[0].start()] if opts else raw)
                if len(options)!=3 or [o['id'] for o in options]!=['A','B','C']:issues.append('nonstandard or incomplete answer options')
                if not linked:issues.append('source answer mapping missing or count conflict')
                correct,explanation,apages,key=(linked if linked else (None,None,[],None))
                independent_key=secondary.get(quiz,{}).get(num)
                dual_key=bool(linked and independent_key and correct==independent_key[0])
                if not dual_key:issues.append('independent source answer-key comparison missing or conflicting')
                explanation=clean(explanation) if explanation else None
                # A shared passage and table can precede questions; do not silently omit it.
                shared=clean(section[:qm[0].start()]) if qm else ''
                if shared:issues.append('shared passage or section introduction requires verification')
                context_markers=r'(?i)(?:following information|following (?:data|table)|relates? to questions|use the|exhibit\s*\d|table\s*\d|following statements|statement [123]|the analyst|the company|the firm|the investor|this (?:information|data)|above|below|shown|diagram|figure)'
                if re.search(context_markers,stem):issues.append('possible table, passage or cross-question context')
                if any(re.search(context_markers,o['text']) for o in options[-1:]):issues.append('option tail may contain material for another question')
                if not qpages:qpages=ps;issues.append('question page mapping missing')
                if any('\ufffd' in src.page(n) for n in qpages):issues.append('source text contains unsupported glyph; original page preserved')
                if any(norm(t) not in independent_text for t in [stem]+[o['text'] for o in options]+([explanation] if explanation else [])):
                    issues.append('independent pdftotext comparison incomplete')
                if explanation and len(explanation)<20:issues.append('source explanation may be image-only or incomplete')
                # Text extraction cannot establish the fidelity of unsupported glyphs or equations.
                if any('\ufffd' in t or '\x00' in t for t in [stem]+[o['text'] for o in options]):issues.append('unsupported source glyph')
                # Existing 11 checked records retain IDs/content verbatim, protecting previous study history.
                old_id=None
                if b['file']=='Fixed.pdf' and mi==0 and num<=5:old_id=f'cfa-2027-v6-lm1-q{num}'
                if b['file'].endswith('Schweser Notes Book 3.pdf'):
                    if quiz=='Module Quiz 51.1':old_id=f'schweser-2027-b3-m51.1-q{num}'
                    if quiz=='Module Quiz 56.1' and num in [1,6]:old_id=f'schweser-2027-b3-m56.1-q{num}'
                if old_id and any(q['id']==old_id for q in old):
                    audits.append({'id':old_id,'candidateId':qid,'status':'validated','method':'existing visually checked sample retained'});continue
                # Source-page practice retains the complete question section and source
                # solutions as images. Transcription risks never become invented text.
                source_ok=bool(dual_key and len(original['optionsCandidate'])==3 and [o['id'] for o in original['optionsCandidate']]==['A','B','C'] and len(options)==3 and [o['id'] for o in options]==['A','B','C'] and qpages and apages and found is not None)
                question_source_pages=sorted(set(ps+qpages))
                # A continuation page may contain another item's answer without
                # repeating the section heading. Treat the whole original answer
                # section as restricted, not merely this item's mapped key pages.
                module_solution_pages=set(range(ansstart,end+1)) if ansstart else set()
                overlap=sorted(set(question_source_pages).intersection(module_solution_pages))
                solution_heading_pages=[pn for pn in question_source_pages if has_solution_heading(src.doc[pn-1].get_text())]
                if overlap:
                    source_ok=False;issues.append('question source pages overlap solution pages; hidden from scored practice')
                if solution_heading_pages:
                    source_ok=False;issues.append('question source page contains a printed solution heading; hidden from scored practice')
                section_numbers=[int(m[1]) for m in qm]
                expected_numbers=[q['number'] for q in candidates if q['quiz']==original['quiz']]
                if section_numbers!=expected_numbers:source_ok=False;issues.append('clean and raw question-number sequences differ')
                evidence_pages=sorted(set(ps+qpages+apages))
                for pn in evidence_pages:
                    dest=ROOT/'public/question-assets'/f'{b["sha256"][:12]}-p{pn}.webp';dest.parent.mkdir(parents=True,exist_ok=True)
                    if not dest.exists():
                        from PIL import Image
                        pix=src.doc[pn-1].get_pixmap(matrix=pymupdf.Matrix(1.7,1.7));Image.frombytes('RGB',[pix.width,pix.height],pix.samples).save(dest,format='WEBP',lossless=True)
                def document_material(id,pages,initial):
                    return {'id':id,'type':'document','pages':[{'pdfPage':pn,'src':f'question-assets/{b["sha256"][:12]}-p{pn}.webp'} for pn in sorted(set(pages))],'initialPage':initial,'title':b['title']}
                materials=[document_material('original-question',ps+qpages,qpages[0])] if source_ok else []
                explanation_materials=[document_material('original-solution',apages,apages[0])] if source_ok else []
                module_topic=module['topic'] if 'topic' in module else b['title'];topic=TOPICS.get(module_topic.upper())
                if not topic:issues.append('topic mapping missing')
                record={'id':qid,'topic':topic,'module':module['title'] if b['category']=='curriculum' else quiz+': '+re.sub(r'^Reading \d+ ','',module['title']),'text':stem,'options':options,'correctOptionId':correct,'explanation':explanation,'preserveOrder':True,'status':'validated' if source_ok else 'review','verifiedBy':'Original-source page mode: complete question-section pages and solution pages retained; explicit answer key agrees between PyMuPDF and Poppler; question/quiz numbering agrees. Searchable transcription is not a substitute for the original page.' if source_ok else None,'materials':materials,'requiredMaterialIds':[m['id'] for m in materials],'explanationMaterials':explanation_materials,'presentation':'source' if source_ok else 'transcription','sources':[{'category':b['category'],'title':b['title'],'edition':b['edition'],'year':b['year'],'location':f'{module["title"]}; {quiz}; Q{num}; PDF pages '+','.join(map(str,qpages)),'answerLocation':f'{quiz}; answer {num}; PDF pages '+','.join(map(str,apages)) if linked else 'unresolved'}],'conversion':{'candidateId':qid,'questionPages':qpages,'sectionPages':ps,'answerPages':apages,'sourceSha256':b['sha256'],'issues':issues,'sourcePracticeReady':source_ok,'dualKeyAgreement':dual_key,'keyEvidence':key,'sharedRawText':shared,'answerPageOverlap':overlap,'solutionHeadingPages':solution_heading_pages}}
                if correct and len(options)>=2 and len({o['id'] for o in options})==len(options) and any(o['id']==correct for o in options) and stem and topic:
                    questions.append(record);converted+=1;active+=record['status']=='validated'
                else:unresolved.append(record)
                audits.append({'id':qid,'status':record['status'],'sourcePracticeReady':source_ok,'dualKeyAgreement':dual_key,'issues':issues});reason_counts.update(issues)
            coverage.append({'source':b['file'],'module':module['title'],'candidates':len(candidates),'newStructured':converted,'newActive':active})
        print(json.dumps({'source':b['file'],'converted':sum(c['newStructured'] for c in coverage if c['source']==b['file']),'newActive':sum(c['newActive'] for c in coverage if c['source']==b['file'])}),flush=True)
    bank={'version':1,'questions':questions,'reviewQueue':unresolved,'coverage':coverage}
    (args.output/'question-bank.json').write_text(json.dumps(bank,ensure_ascii=False,separators=(',',':')))
    (args.output/'audit.json').write_text(json.dumps({'structured':len(questions),'active':sum(q['status']=='validated' for q in questions),'unresolved':len(unresolved),'reasonCounts':reason_counts,'records':audits},ensure_ascii=False,indent=2))
    print('RESULT',len(questions),'structured;',sum(q['status']=='validated' for q in questions),'active;',len(unresolved),'unresolved',flush=True)
if __name__=='__main__':main()
