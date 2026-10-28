#!/usr/bin/env python3
"""Resumable source transcription; never creates validated scored questions.
Uses an explicit inventory of user-provided PDFs. All text is untrusted source content.
"""
import argparse,csv,hashlib,html,json,re,zipfile
from pathlib import Path
import pymupdf
VERSION=1

def numbered(text,category):
    candidates=list(re.finditer(r'(?m)^[ \t]*(\d+)\.(?:[ ]*\t[ \t]*|[ ]+(?=\S))',text))
    # Question numbering increases within each located quiz. Nested numbered lists
    # restart below the current question; keep them inside the question text.
    starts=[];last=0
    for marker in candidates:
        number=int(marker[1])
        if last<number<=300:
            starts.append(marker);last=number
    records=[]
    for i,m in enumerate(starts):
        raw=text[m.end():starts[i+1].start() if i+1<len(starts) else len(text)].strip()
        optionpattern=r'(?m)^([A-D])\.\t[ ]*' if category=='curriculum' else r'(?m)^\s*([A-D])\.\s+'
        options=list(re.finditer(optionpattern,raw))
        records.append({'number':int(m[1]),'rawText':raw,'stemCandidate':raw[:options[0].start()].strip() if options else raw,'optionsCandidate':[{'id':o[1],'rawText':raw[o.end():options[j+1].start() if j+1<len(options) else len(raw)].strip()} for j,o in enumerate(options)],'status':'review','warnings':['Automatic text segmentation; not source-validated. Page headers may remain; shared text and page images must be consulted.']})
    return records,text[:starts[0].start()].strip() if starts else text

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--inventory',type=Path,required=True);parser.add_argument('--output',type=Path,required=True);parser.add_argument('--source-dir',type=Path,help='Optional explicit source folder when moving the original PDFs');args=parser.parse_args()
    inventory=json.loads(args.inventory.read_text());args.output.mkdir(parents=True,exist_ok=True)
    allrecords=[];coverage=[];books=[]
    for book in inventory:
        source=Path(book['path'])
        if args.source_dir:
            matches=list(args.source_dir.resolve(strict=True).rglob(book['file']))
            if len(matches)!=1:raise ValueError(f'Expected exactly one {book["file"]} inside the provided source folder')
            source=matches[0]
        digest=hashlib.sha256(source.read_bytes()).hexdigest()
        if digest!=book['sha256']:raise ValueError(f'Source changed: {source.name}')
        target=args.output/(book['category']+'-'+digest[:12]);target.mkdir(exist_ok=True)
        pdf=pymupdf.open(source);toc=pdf.get_toc();pagecache={};imagepages=set()
        def page(n):
            if n not in pagecache:pagecache[n]=pdf[n-1].get_text('text')
            return pagecache[n]
        def text(start,end):return '\n'.join(f'\n[PDF PAGE {n}]\n'+page(n) for n in range(start,end+1))
        # Full raw pages keep all in-text questions/examples, including ones without standalone quiz headings.
        rawfile=target/'all-pages.jsonl';checkpoint=target/'raw-checkpoint.json'
        cached=False
        if rawfile.exists() and checkpoint.exists():
            meta=json.loads(checkpoint.read_text())
            if meta.get('sourceSha256')==digest and meta.get('rawSha256')==hashlib.sha256(rawfile.read_bytes()).hexdigest():
                entries=[json.loads(line) for line in rawfile.read_text().splitlines()]
                if [r['pdfPage'] for r in entries]==list(range(1,len(pdf)+1)):
                    pagecache.update({r['pdfPage']:r['rawText'] for r in entries});cached=True
        if not cached:
            with rawfile.open('w') as f:
                for n in range(1,len(pdf)+1):f.write(json.dumps({'pdfPage':n,'rawText':page(n),'pageSize':list(pdf[n-1].rect)},ensure_ascii=False)+'\n')
        checkpoint.write_text(json.dumps({'sourceSha256':digest,'rawSha256':hashlib.sha256(rawfile.read_bytes()).hexdigest()}))
        sections=[]
        for index,module in enumerate(book['modules']):
            if module.get('recordType')=='appendix' or 'Appendices A-E' in module['title']:continue
            start=module['pdfStart'];nextstart=book['modules'][index+1]['pdfStart'] if index+1<len(book['modules']) else len(pdf)+1
            # The TOC may contain glossary entries after the last learning module.
            higher=[p for level,name,p in toc if p>start and name in ['Glossary','Index','Formulas','Appendix','Appendices']]
            end=min([nextstart-1,len(pdf)]+[p-1 for p in higher])
            full=text(start,end);slug=f'module-{index+1:03d}';(target/(slug+'-fulltext.txt')).write_text(full)
            keypages=module['answerPages'];answerstart=min(keypages) if keypages else None
            answertext=text(answerstart,end) if answerstart else ''
            if answertext:(target/(slug+'-answers.txt')).write_text(answertext)
            blocks=[]
            if book['category']=='curriculum' and module['questionPages']:
                qstart=min(module['questionPages']);qend=(answerstart-1) if answerstart else end
                raw=text(qstart,qend)
                # Keep every page untouched alongside the section text; do not infer answers.
                blocks=[('Practice Problems',raw,list(range(qstart,qend+1)))]
            elif book['category']=='schweser':
                markers=list(re.finditer(r'(?m)^MODULE QUIZ[ \t]+(\d+[^\n]*)\n',full))
                for marker in markers:
                    after=full[marker.end():]
                    stop=re.search(r'(?m)^(?:MODULE QUIZ\s+\d|MODULE\s+\d+\.\d+|KEY CONCEPTS|ANSWER KEY FOR MODULE QUIZZES)',after)
                    raw=after[:stop.start()] if stop else after
                    # Locate page references by the most recent preceding page marker and following markers.
                    preceding=list(re.finditer(r'\[PDF PAGE (\d+)\]',full[:marker.start()]))
                    pages=([int(preceding[-1][1])] if preceding else [])+[int(n) for n in re.findall(r'\[PDF PAGE (\d+)\]',raw)]
                    blocks.append(('Module Quiz '+marker[1],raw,sorted(set(pages))))
            total=0;sequenceissues=[]
            for blockidx,(label,raw,pages) in enumerate(blocks):
                records,shared=numbered(raw,book['category']);numbers=[q['number'] for q in records];contiguous=numbers==list(range(1,len(numbers)+1))
                if not contiguous or not records:sequenceissues.append(label+': numbering requires review')
                (target/f'{slug}-section-{blockidx+1}.txt').write_text(raw)
                for q in records:
                    q.update(id=f'{book["category"]}-{digest[:12]}-m{index+1}-s{blockidx+1}-q{q["number"]}',sourceFile=book['file'],sourceSha256=digest,year=book['year'],module=module['title'],quiz=label,pdfPages=pages,sharedRawText=shared,answerSectionFile=f'{target.name}/{slug}-answers.txt' if answertext else None,correctOptionId=None)
                    if not contiguous:q['warnings'].append('Number sequence is not contiguous; possible false or missed boundary.')
                    if len(q['optionsCandidate'])!=3:q['warnings'].append('Not exactly three options; may be non-MCQ or require layout review.')
                    allrecords.append(q)
                total+=len(records);imagepages.update(pages)
                sections.append({'module':module['title'],'quiz':label,'raw':raw,'records':records,'shared':shared,'pages':pages})
            coverage.append({'source':book['file'],'category':book['category'],'module':module['title'],'sectionsLocated':len(blocks),'segmentedQuestionCandidates':total,'sourceQuestionTotal':None,'validatedForScoring':0,'issues':sequenceissues or (['No standalone practice section; full module text preserved (includes cases/examples if present).'] if not blocks else ['Candidates require page comparison; total completeness unverified.'])})
        images=target/'pages';images.mkdir(exist_ok=True)
        for n in sorted(imagepages):
            image=images/f'{n:04d}.png'
            if not image.exists():pdf[n-1].get_pixmap(matrix=pymupdf.Matrix(1.4,1.4)).save(image)
        archive=''.join(f'<li><a href="module-{i+1:03d}-fulltext.txt">{html.escape(m["title"])}</a></li>' for i,m in enumerate(book['modules']) if m.get('recordType')!='appendix' and 'Appendices A-E' not in m['title'])
        body=[f'<h1>{html.escape(book["title"])}</h1><p>2027 · Raw transcription — not validated for scored practice. Refer to source images for formulas, tables, shared passages, layout and ambiguous text. Answer sections remain separate; answers were not inferred.</p>']
        body.append('<details><summary>All module text, including in-text cases and examples</summary><ul>'+archive+'</ul></details>')
        md=[f'# {book["title"]}','', 'Raw transcription. All automatically segmented records require source review. Shared passages and page images are mandatory companions.','']
        for sec in sections:
            body+=[f'<h2>{html.escape(sec["module"])}</h2><h3>{html.escape(sec["quiz"])}</h3>','<p>Source PDF pages: '+', '.join(f'<a href="pages/{n:04d}.png">{n}</a>' for n in sec['pages'])+'</p>',f'<details><summary>Full section / shared material</summary><pre>{html.escape(sec["raw"])}</pre></details>']
            md += ['## '+sec['module'],'### '+sec['quiz'],'PDF pages: '+', '.join(map(str,sec['pages'])),'',sec['raw'],'']
            if sec['shared']:body.append('<pre>'+html.escape(sec['shared'])+'</pre>')
            for q in sec['records']:body.append(f'<article id="{q["id"]}"><h4>Question {q["number"]} · needs review</h4><pre>{html.escape(q["rawText"])}</pre></article>')
        (target/'questions.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><title>Source questions</title><style>body{font:16px Arial;line-height:1.6;max-width:1000px;margin:30px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}article{border-top:1px solid #aaa;padding:15px}h2{color:#174c3e}</style>'+''.join(body))
        (target/'questions.md').write_text('\n'.join(md));books.append({'file':book['file'],'folder':target.name,'year':book['year'],'sha256':digest,'rawPages':len(pdf),'questionSectionPages':len(imagepages)})
        print(json.dumps({'file':book['file'],'modules':sum(c['source']==book['file'] for c in coverage),'candidates':sum(c['segmentedQuestionCandidates'] for c in coverage if c['source']==book['file']),'imagePages':len(imagepages)}),flush=True)
    with (args.output/'question-candidates.jsonl').open('w') as f:
        for q in allrecords:f.write(json.dumps(q,ensure_ascii=False)+'\n')
    manifest={'version':VERSION,'sourceBooks':books,'candidateCount':len(allrecords),'validatedForScoring':0,'coverage':coverage,'countsAre':'automatic segmentation counts, not confirmed source totals','appBankChanged':False}
    (args.output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2))
    with (args.output/'coverage.csv').open('w') as f:
        writer=csv.DictWriter(f,fieldnames=list(coverage[0]));writer.writeheader();writer.writerows(coverage)
    links=''.join(f'<li><a href="{b["folder"]}/questions.html">{html.escape(b["file"])}</a></li>' for b in books)
    (args.output/'index.html').write_text('<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><title>تفريغ الأسئلة</title><body style="font:18px Arial;line-height:1.8;max-width:900px;margin:40px auto;padding:20px"><h1>تفريغ الكتب</h1><p>هذا تفريغ آلي للمراجعة، وليس بنكًا معتمدًا. النص الخام لكل صفحات الكتب محفوظ، وأقسام الأسئلة مفصولة حيث أمكن. الصور الأصلية تحفظ الجداول والمعادلات التي قد لا تظهر في النص. الإجابات لم تُستنتج ولم تُستورد إلى التطبيق.</p><ul>'+links+'</ul></body></html>')
    print(f'Total candidates: {len(allrecords)}; books: {len(books)}; validated: 0',flush=True)
if __name__=='__main__':main()
