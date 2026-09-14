"""Use the same JS validator as the workshop before importing an edit file."""
import subprocess,sys
from .sources import ROOT
if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('Usage: python -m pipeline.apply_corrections FILE')
    subprocess.run(['node','scripts/import-corrections.mjs',sys.argv[1]],cwd=ROOT,check=True)
