#!/usr/bin/env python3
"""Package the private transcriptions without source PDFs or browser authentication."""
from pathlib import Path
import zipfile
root=Path('private-sources/transcripts');output=Path('releases');output.mkdir(exist_ok=True)
for name,images in [('Book-Transcripts-Text.zip',False),('Book-Transcripts-With-Pages.zip',True)]:
    with zipfile.ZipFile(output/name,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as archive:
        for p in root.rglob('*'):
            if not p.is_file() or p.name=='repeat-before.sha256':continue
            if not images and p.suffix in ['.png','.html']:continue
            if not images and p.name=='START-HERE.txt':
                archive.writestr('Book-Transcripts/START-HERE.txt','افتح مجلد الكتاب ثم questions.txt لقراءة أسئلة الأقسام. نص كل وحدة في module-*-fulltext.txt والحلول في module-*-answers.txt. هذه النسخة النصية لا تشمل الصور؛ الجداول والصيغ تحتاج الرجوع إلى ملفات PDF الأصلية أو حزمة With-Pages. التفريغ آلي للمراجعة وليس ملف استيراد إلى التطبيق.\n');continue
            archive.write(p,'Book-Transcripts/'+str(p.relative_to(root)))
    with zipfile.ZipFile(output/name) as archive:
        if archive.testzip() is not None:raise ValueError('Archive integrity check failed')
    print(name,(output/name).stat().st_size)
