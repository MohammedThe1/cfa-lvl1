import {readFile,writeFile,mkdir,cp,access} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
const html=await readFile('dist/index.html','utf8');
const scriptPath=html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
const cssPath=html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/)?.[1];
if(!scriptPath||!cssPath)throw Error('Expected one bundled application script and stylesheet.');
const [js,css,rawBank]=await Promise.all([readFile('dist'+scriptPath,'utf8'),readFile('dist'+cssPath,'utf8'),readFile('public/question-bank.json','utf8')]);
const bank=JSON.stringify(JSON.parse(rawBank)).replace(/</g,'\\u003c');
const portable=html.replace(/<script[^>]*src="[^"]+"[^>]*><\/script>/,()=>`<script id="bundled-questions" type="application/json">${bank}</script><script type="module">${js.replace(/<\/script/gi,'<\\/script')}</script>`).replace(/<link[^>]*href="[^"]+\.css"[^>]*>/,()=>`<style>${css}</style>`);
await mkdir('releases/Madar-Study',{recursive:true});
await writeFile('releases/Madar-Study/Madar.html',portable);
try{await access('public/question-assets');await cp('public/question-assets','releases/Madar-Study/question-assets',{recursive:true});}catch(error){if(error.code!=='ENOENT')throw error;}
await writeFile('releases/Madar-Study/START-HERE.txt','فك ضغط الحزمة كاملة ثم افتح Madar.html في Chrome. أبقِ مجلد question-assets بجانب الملف؛ فهو يحتوي الصفحات الأصلية للأسئلة والحلول. لا يلزم تثبيت برامج. الأسئلة المعلّقة تظهر من Sources ثم Browse all converted questions وتُستبعد من التصحيح. احفظ نسخة تقدمك من Sources → Export questions and progress. عند نقلها إلى جهاز آخر، انقل حزمة التطبيق كاملة ثم استورد نسخة التقدم.\n');
execFileSync('python3',['scripts/zip-study-release.py'],{stdio:'inherit'});
console.log('Created releases/Madar-Study.zip. Extract the entire folder and open Madar.html; keep question-assets beside it.');
