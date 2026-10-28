#!/usr/bin/env python3
"""Lossless source-page raster assets, regenerated only from fingerprinted PDFs."""
from pathlib import Path
import hashlib,json,re
import pymupdf
from PIL import Image
root=Path(__file__).resolve().parents[1];inventory=json.loads((root/'private-sources/review/inventory.json').read_text());assets=root/'public/question-assets';report=[]
for book in inventory:
    files=list(assets.glob(book['sha256'][:12]+'-p*.webp'))
    if not files:continue
    if hashlib.sha256(Path(book['path']).read_bytes()).hexdigest()!=book['sha256']:raise ValueError('Source changed')
    doc=pymupdf.open(book['path'])
    for dest in files:
        n=int(re.search(r'-p(\d+)',dest.name)[1]);pix=doc[n-1].get_pixmap(matrix=pymupdf.Matrix(1.7,1.7));im=Image.frombytes('RGB',[pix.width,pix.height],pix.samples);im.save(dest,format='WEBP',lossless=True)
        with Image.open(dest) as check:
            if check.tobytes()!=im.tobytes():raise ValueError('Source raster did not round-trip losslessly')
        report.append({'asset':dest.name,'sourceSha256':book['sha256'],'pdfPage':n,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'losslessRaster':True})
    print(book['file'],len(files),flush=True)
(root/'private-sources/converted/assets-manifest.json').write_text(json.dumps(report,indent=2))
