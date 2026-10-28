#!/usr/bin/env python3
"""Capture specified PDF pages as raw layout/text + PNG evidence. Never invent questions.
Call only on files in a user-provided folder. PDF/page evidence is private.
"""
import argparse, hashlib, json, os
from pathlib import Path
import pymupdf

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('pdf',type=Path)
    p.add_argument('--pages',required=True,help='Explicit 1-based pages, e.g. 12-14,28')
    p.add_argument('--output',required=True,type=Path)
    args=p.parse_args()
    pdf=args.pdf.resolve(strict=True)
    if not pdf.is_file() or pdf.suffix.lower()!='.pdf':p.error('Expected one explicitly selected PDF file.')
    sha=hashlib.file_digest(pdf.open('rb'),'sha256').hexdigest()
    doc=pymupdf.open(pdf)
    if doc.needs_pass:p.error('Encrypted PDF: unlock using an authorized local workflow first; do not send passwords in chat.')
    pages=set()
    try:
        for part in args.pages.split(','):
            ends=[int(x) for x in part.split('-')]
            if len(ends)>2 or min(ends)<1 or max(ends)>len(doc) or ends[-1]<ends[0]:raise ValueError()
            pages.update(range(ends[0],ends[-1]+1))
    except ValueError:p.error('Invalid page range.')
    output=args.output.resolve()/sha[:16]
    output.mkdir(parents=True,exist_ok=True)
    manifest=output/'manifest.json'
    record=json.loads(manifest.read_text()) if manifest.exists() else {'source':str(pdf),'sha256':sha,'pageCount':len(doc),'metadata':doc.metadata,'pages':{},'questionExtraction':'not performed','coverage':'unverified'}
    if record['sha256']!=sha:raise RuntimeError('Source fingerprint differs; use a separate evidence directory.')
    for number in sorted(pages):
        key=str(number)
        files=[output/f'page-{number}.{extension}' for extension in ['json','txt','png']]
        existing=record['pages'].get(key)
        if existing and all(f.exists() and hashlib.sha256(f.read_bytes()).hexdigest()==existing['digests'].get(f.name) for f in files):
            print(f'Page {number}: retained verified evidence files');continue
        page=doc[number-1]
        raw={'page':number,'rect':list(page.rect),'blocks':page.get_text('blocks'),'words':page.get_text('words')}
        files[0].write_text(json.dumps(raw,ensure_ascii=False,indent=2))
        text=page.get_text('text');files[1].write_text(text)
        page.get_pixmap(matrix=pymupdf.Matrix(2,2)).save(files[2])
        record['pages'][key]={'characters':len(text.strip()),'needsVisualReview':True,'ocrCandidate':len(text.strip())<30,'digests':{f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in files}}
        temp=manifest.with_suffix('.tmp');temp.write_text(json.dumps(record,ensure_ascii=False,indent=2));os.replace(temp,manifest)
        print(f'Page {number}: raw evidence captured, not validated')
    print(f'Evidence: {output}; questions extracted: 0. Compare original pages before creating/importing records.')
if __name__=='__main__':main()
