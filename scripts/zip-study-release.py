from pathlib import Path
import zipfile
root=Path('releases/Madar-Study')
with zipfile.ZipFile('releases/Madar-Study.zip','w',zipfile.ZIP_DEFLATED,compresslevel=5) as archive:
    for p in root.rglob('*'):
        if p.is_file():archive.write(p,'Madar-Study/'+str(p.relative_to(root)))
with zipfile.ZipFile('releases/Madar-Study.zip') as archive:
    if archive.testzip() is not None:raise ValueError('Release archive integrity check failed')
