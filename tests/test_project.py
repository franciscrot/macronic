import base64
import io
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from pipeline.project import create_project, verify_sources, read_json, run_project
from pipeline.worker import make_handler

class ProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.en=self.root/'en.txt';self.fr=self.root/'fr.txt'
        self.en.write_bytes(b'\xef\xbb\xbfA sentence.\r\n\r\nAnother sentence.\r\n')
        self.fr.write_text('Une phrase.\n\nUne autre phrase.',encoding='utf-8')
    def tearDown(self):self.temp.cleanup()
    def create(self,**kwargs):
        return create_project(self.en,self.fr,self.root/'book',title='My book',english_edition='Unknown',target_edition='Unknown',**kwargs)
    def test_import_preserves_bytes_and_exact_normalized_offsets(self):
        p=self.create();self.assertEqual((p/'data/sources/en.original.txt').read_bytes(),self.en.read_bytes())
        text=verify_sources(p)['en'];self.assertEqual(text,'A sentence.\n\nAnother sentence.\n')
        self.assertEqual(len(read_json(p/'data/samples/paragraphs.json')['languages']['en']),2)
        for paragraph in read_json(p/'data/samples/paragraphs.json')['languages']['en']:
            self.assertEqual(text[paragraph['source_start']:paragraph['source_end']],paragraph['text'])
        self.assertFalse((p/'data/candidates/dataset.json').exists())
    def test_refuses_overwrite_unsupported_language_and_invalid_inputs(self):
        with self.assertRaises(ValueError):self.create(target_language='yi')
        self.assertFalse((self.root/'book').exists())
        self.create()
        with self.assertRaises(ValueError):self.create()
        self.en.write_bytes(b'\xff')
        with self.assertRaises(ValueError):create_project(self.en,self.fr,self.root/'bad',title='X',english_edition='Unknown',target_edition='Unknown')
        self.assertFalse((self.root/'bad').exists())
    def test_modified_sources_fail_closed(self):
        p=self.create();(p/'data/sources/en.txt').write_text('Changed')
        with self.assertRaises(ValueError):verify_sources(p)
    def test_failed_inference_preserves_sources_without_fake_results(self):
        p=self.create()
        with patch('pipeline.project_inference.infer',side_effect=ImportError('Models unavailable')):
            with self.assertRaises(ImportError):run_project(p)
        self.assertEqual(read_json(p/'project.json')['status'],'failed')
        self.assertFalse((p/'data/candidates/dataset.json').exists());verify_sources(p)
    def request(self,request):
        class Socket:
            def __init__(self):self.response=b''
            def makefile(self,*args):return io.BytesIO(request)
            def sendall(self,data):self.response+=data
        socket=Socket();handler=make_handler(self.root,8765)
        handler.log_message=lambda *args:None
        handler(socket,('127.0.0.1',0),None)
        return socket.response
    def test_local_upload_saves_project_and_foreign_origin_is_rejected(self):
        body=json.dumps({'english':base64.b64encode(self.en.read_bytes()).decode(),'translation':base64.b64encode(self.fr.read_bytes()).decode(),'title':'Upload','english_edition':'Unknown','target_edition':'Unknown','sources_only':True}).encode()
        headers=b'POST /api/projects HTTP/1.0\r\nHost: 127.0.0.1:8765\r\nContent-Type: application/json\r\nContent-Length: '+str(len(body)).encode()+b'\r\n'
        response=self.request(headers+b'Origin: https://example.com\r\n\r\n'+body)
        self.assertIn(b'403 Forbidden',response)
        response=self.request(headers+b'Origin: http://127.0.0.1:8765\r\n\r\n'+body)
        self.assertIn(b'201 Created',response)
        p=json.loads(response.split(b'\r\n\r\n',1)[1]);self.assertEqual(p['status'],'imported');verify_sources(self.root/p['id'])
        response=self.request(f'GET /api/projects/{p["id"]}/backup HTTP/1.0\r\nHost: 127.0.0.1:8765\r\n\r\n'.encode())
        self.assertIn(b'application/zip',response)
    def test_worker_rejects_path_escape(self):
        response=self.request(b'GET /shared/../../README.md HTTP/1.0\r\nHost: 127.0.0.1:8765\r\n\r\n')
        self.assertIn(b'404 Not Found',response)

if __name__=='__main__':unittest.main()
