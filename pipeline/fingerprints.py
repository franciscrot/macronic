"""Shared inference inputs; keep FILES in sync with scripts/tasks.mjs."""
from .sources import ROOT,digest
FILES=['pipeline/fingerprints.py','pipeline/prepare.py','pipeline/sources.py','pipeline/corrections.py','pipeline/vendor/bertalign_core.py','pipeline/models.json','pipeline/requirements.lock.txt']
def inference_fingerprint():
    return digest(b''.join(p.encode()+b'\0'+(ROOT/p).read_bytes()+b'\0' for p in FILES))
