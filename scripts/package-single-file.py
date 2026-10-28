#!/usr/bin/env python3
"""Bundle original page assets once each for a download requiring no extraction."""
from pathlib import Path
import base64, json
root=Path(__file__).resolve().parents[1]
folder=root/'releases/Madar-Study'
html=(folder/'Madar.html').read_text()
assets={'question-assets/'+p.name:base64.b64encode(p.read_bytes()).decode('ascii') for p in sorted((folder/'question-assets').glob('*.webp'))}
marker='<script type="module">'
if html.count(marker)!=1:raise ValueError('Expected exactly one inline app module')
html=html.replace(marker,'<script>globalThis.MADAR_BUNDLED_ASSETS='+json.dumps(assets,separators=(',',':'))+';</script>'+marker,1)
out=root/'releases/Madar-Open.html'
out.write_text(html)
print(f'Created {out.name}: {len(assets)} original source pages, {out.stat().st_size:,} bytes. Open directly in Chrome; no extraction required.')
