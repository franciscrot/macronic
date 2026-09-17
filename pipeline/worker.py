"""Local-only preparation service. Run: python -m pipeline.worker --projects corpus"""
import argparse
import base64
import io
import json
import mimetypes
import re
import subprocess
import sys
import tempfile
import threading
import uuid
import zipfile
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse
from .sources import ROOT
from .project import create_project, read_json, write_json, MAX_BYTES


def make_handler(projects, port):
    pool=ThreadPoolExecutor(max_workers=1)
    active=set();lock=threading.Lock()
    def run(project):
        try:
            with (project/'preparation.log').open('w') as log:
                result=subprocess.run([sys.executable,'-m','pipeline.project','run',str(project)],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
            meta=read_json(project/'project.json')
            if result.returncode and meta['status']!='failed':
                meta.update(status='failed',error='Preparation stopped. See the log; imported sources are retained.')
                write_json(project/'project.json',meta)
        finally:
            with lock: active.discard(project.name)
    class Handler(BaseHTTPRequestHandler):
        def allowed(self):
            host=self.headers.get('Host','')
            origin=self.headers.get('Origin')
            return host in {f'127.0.0.1:{port}',f'localhost:{port}'} and (origin is None or origin==f'http://{host}')
        def send(self,status,value,kind='application/json'):
            body=json.dumps(value).encode() if kind=='application/json' else value
            self.send_response(status);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)))
            self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(body)
        def project(self,identifier):
            if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}',identifier):raise ValueError('Invalid project ID')
            p=projects/identifier
            if p.is_symlink() or not (p/'project.json').exists():raise ValueError('Project not found')
            return p
        def do_GET(self):
            if not self.allowed():return self.send(403,{'error':'Use the local app address printed in your terminal.'})
            try:
                route=unquote(urlparse(self.path).path)
                if route=='/api/info':return self.send(200,{'local_worker':True,'languages':['fr']})
                if route=='/api/projects':
                    return self.send(200,[dict(read_json(p/'project.json'),id=p.name) for p in sorted(projects.iterdir()) if (p/'project.json').is_file() and not p.is_symlink() and re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_-]{0,79}',p.name)])
                if route.startswith('/api/projects/'):
                    parts=route.strip('/').split('/');p=self.project(parts[2])
                    if len(parts)==4 and parts[3]=='backup':
                        buffer=io.BytesIO()
                        with zipfile.ZipFile(buffer,'w',zipfile.ZIP_DEFLATED) as z:
                            for f in p.rglob('*'):
                                if f.is_file() and not f.is_symlink():z.write(f,f.relative_to(p))
                        return self.send(200,buffer.getvalue(),'application/zip')
                    meta=read_json(p/'project.json');meta['id']=p.name
                    log=p/'preparation.log';meta['log']=log.read_text(errors='replace')[-6000:] if log.exists() else ''
                    return self.send(200,meta)
                if route.startswith('/projects/'):
                    parts=route.strip('/').split('/');p=self.project(parts[1]);base=p
                    relative='/'.join(parts[2:])
                else:
                    base=ROOT/'src';relative='prepare/index.html' if route=='/' else route.lstrip('/')
                    if relative.split('/')[0] not in {'prepare','guide','shared'}:raise ValueError('Not found')
                f=(base/relative).resolve()
                if f.is_dir():f=f/'index.html'
                if not f.is_relative_to(base.resolve()) or any(part.startswith('.') for part in Path(relative).parts):raise ValueError('Not found')
                return self.send(200,f.read_bytes(),mimetypes.guess_type(str(f))[0] or 'application/octet-stream')
            except (ValueError,OSError,IndexError):self.send(404,{'error':'Not found'})
        def do_POST(self):
            if not self.allowed():return self.send(403,{'error':'Cross-origin requests are not accepted.'})
            if self.headers.get('Content-Type')!='application/json':return self.send(415,{'error':'Expected application/json'})
            try:
                size=int(self.headers.get('Content-Length','0'))
                if not 0<size<=6_000_000:raise ValueError('Upload exceeds size limit')
                body=json.loads(self.rfile.read(size))
                if self.path!='/api/projects':return self.send(404,{'error':'Not found'})
                with lock:
                    if len(active)>=8:raise ValueError('Preparation queue is full; wait for a job to finish.')
                identifier=uuid.uuid4().hex;project=projects/identifier
                with tempfile.TemporaryDirectory() as temp:
                    paths=[]
                    for key in ['english','translation']:
                        raw=base64.b64decode(body[key],validate=True)
                        if len(raw)>MAX_BYTES:raise ValueError('Each text must be at most 2 MB')
                        file=Path(temp)/key;file.write_bytes(raw);paths.append(file)
                    create_project(*paths,project,title=body['title'],target_language=body.get('target_language','fr'),
                                   english_edition=body['english_edition'],target_edition=body['target_edition'],
                                   english_url=body.get('english_url',''),target_url=body.get('target_url',''),rights=body.get('rights','Unspecified'))
                if not body.get('sources_only',False):
                    meta=read_json(project/'project.json');meta['status']='queued';write_json(project/'project.json',meta)
                    with lock:active.add(identifier)
                    pool.submit(run,project)
                self.send(201,{'id':identifier,'status':read_json(project/'project.json')['status']})
            except (ValueError,KeyError,TypeError,OSError) as error:self.send(400,{'error':str(error)})
    return Handler


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--projects',default='corpus');parser.add_argument('--port',type=int,default=8765);args=parser.parse_args()
    projects=Path(args.projects).resolve();projects.mkdir(parents=True,exist_ok=True)
    # An interrupted model run is not presented as still running after restart.
    for p in projects.glob('*/project.json'):
        meta=read_json(p)
        if meta.get('status') in ['queued','running']:
            meta.update(status='failed',error='Worker stopped before completion. Sources retained; retry with the preparation command.');write_json(p,meta)
    server=ThreadingHTTPServer(('127.0.0.1',args.port),make_handler(projects,args.port))
    print(f'Macronic local preparation: http://127.0.0.1:{args.port}/\nProjects saved in {projects}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
