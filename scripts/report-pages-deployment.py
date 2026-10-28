#!/usr/bin/env python3
"""Record deployment evidence so a Git-only publishing workspace can read it."""
import hashlib,json,os,sys,time,urllib.request
from pathlib import Path

repo=os.environ['GITHUB_REPOSITORY']
report={'commit':os.environ['GITHUB_SHA'],'build':os.environ.get('BUILD_RESULT'),
        'deploy':os.environ.get('DEPLOY_RESULT'),'siteUrl':os.environ.get('SITE_URL'),
        'publicVerified':False,'runUrl':f"https://github.com/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}"}
def get(url,token=None):
    headers={'User-Agent':'Madar-publication-check'}
    if token:headers['Authorization']='Bearer '+token
    with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=25) as response:
        return response.read()
if report['deploy']=='success' and report['siteUrl']:
    base=report['siteUrl'].rstrip('/')+'/'
    for attempt in range(3):
        try:
            html=get(base).decode()
            if 'Madar' not in html:raise ValueError('Unexpected public document')
            raw=get(base+'question-bank.json')
            local=Path('public/question-bank.json').read_bytes()
            if hashlib.sha256(raw).digest()!=hashlib.sha256(local).digest():raise ValueError('Published bank differs from committed bank')
            bank=json.loads(raw)
            source=next(q for q in bank['questions'] if q.get('presentation')=='source' and q['status']=='validated')
            asset=source['materials'][0]['pages'][0]['src']
            if hashlib.sha256(get(base+asset)).digest()!=hashlib.sha256(Path('public',asset).read_bytes()).digest():raise ValueError('Published source image differs')
            report.update(publicVerified=True,readyQuestions=sum(q['status']=='validated' for q in bank['questions']),bankSha256=hashlib.sha256(raw).hexdigest(),verifiedImage=asset)
            break
        except Exception as error:
            report['verificationError']=str(error)
            if attempt<2:time.sleep(10)
try:
    jobs=json.loads(get(f"https://api.github.com/repos/{repo}/actions/runs/{os.environ['GITHUB_RUN_ID']}/jobs",os.environ.get('GH_TOKEN')))
    report['jobs']=[{'name':j['name'],'conclusion':j['conclusion'],'failedSteps':[s['name'] for s in j.get('steps',[]) if s.get('conclusion')=='failure']} for j in jobs.get('jobs',[])]
except Exception as error:
    report['jobDetailsError']=str(error)
Path(sys.argv[1]).write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='jobs'},indent=2))
