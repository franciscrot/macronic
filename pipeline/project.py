"""Prepare isolated English/French authoring projects from UTF-8 text files."""
import argparse
import json
import re
import shutil
import subprocess
import tempfile
from pathlib import Path
from .sources import ROOT, digest

MAX_BYTES = 2_000_000


def read_json(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def write_json(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(path)


def paragraphs(text, language):
    return [{'id': f'{language}-p{i+1:05}', 'text': m.group(),
             'source_start': m.start(), 'source_end': m.end()}
            for i, m in enumerate(re.finditer(r'\S(?:.*?\S)?(?=\n\s*\n|\Z)', text, re.S))]


def create_project(english, translation, output, *, title, target_language='fr',
                   english_edition='', target_edition='', english_url='', target_url='', rights='Unspecified'):
    if target_language != 'fr':
        raise ValueError('Preparation currently supports English/French only. Yiddish display is supported, but its preparation adapter is not validated.')
    if not title.strip() or not english_edition.strip() or not target_edition.strip():
        raise ValueError('Title and both edition descriptions are required; write Unknown when an edition is unknown.')
    output = Path(output).resolve()
    if output.exists():
        raise ValueError('Output already exists. Choose a new project directory; existing work is never overwritten.')
    inputs = []
    for language, file, edition, url in [('en', english, english_edition, english_url), ('fr', translation, target_edition, target_url)]:
        raw = Path(file).read_bytes()
        if len(raw) > MAX_BYTES:
            raise ValueError('Each input must be at most 2 MB. Begin with one chapter.')
        text = raw.decode('utf-8-sig').replace('\r\n', '\n').replace('\r', '\n')
        if not text.strip() or '\x00' in text:
            raise ValueError('Inputs must be nonempty UTF-8 plain text, without NUL characters.')
        inputs.append((language, raw, text, edition, url))
    output.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(prefix='.macronic-import-', dir=output.parent))
    try:
        sources = []
        for language, raw, text, edition, url in inputs:
            folder = stage / 'data/sources'; folder.mkdir(parents=True, exist_ok=True)
            (folder / f'{language}.original.txt').write_bytes(raw)
            (folder / f'{language}.txt').write_text(text, encoding='utf-8', newline='')
            sources.append({'language': language, 'file': f'{language}.original.txt', 'sha256': digest(raw),
                            'normalized_file': f'{language}.txt', 'normalized_sha256': digest(text),
                            'edition': edition.strip(), 'url': url.strip(), 'rights': rights,
                            'transforms': ['UTF-8 BOM removed if present', 'CRLF and CR normalized to LF; no text omitted']})
        write_json(stage / 'data/sources/provenance.json', {'schema_version': 1, 'sources': sources})
        write_json(stage / 'data/samples/paragraphs.json', {'schema_version': 1, 'languages': {l: paragraphs(t,l) for l,raw,t,e,u in inputs}})
        write_json(stage / 'project.json', {'schema_version': 1, 'title': title.strip(), 'chapter': '',
                                          'languages': {'base': 'en', 'learning': 'fr'}, 'status': 'imported'})
        stage.rename(output)
    finally:
        if stage.exists(): shutil.rmtree(stage)
    return output


def verify_sources(project):
    project = Path(project)
    sources = read_json(project / 'data/sources/provenance.json')['sources']
    texts = {}
    for s in sources:
        folder = project / 'data/sources'
        for name, expected in [(s['file'],s['sha256']), (s['normalized_file'],s['normalized_sha256'])]:
            if Path(name).name != name or digest((folder / name).read_bytes()) != expected:
                raise ValueError('Source file changed. Create a new project so offsets and amendments cannot silently drift.')
        texts[s['language']] = (folder / s['normalized_file']).read_text(encoding='utf-8')
    if set(texts) != {'en','fr'}: raise ValueError('Unsupported project languages')
    return texts


def run_project(project, max_align=5):
    project = Path(project).resolve()
    manifest = read_json(project / 'project.json')
    if manifest['status'] == 'prepared' or (project / 'data/candidates/dataset.json').exists():
        raise ValueError('This project already has results. Create a new project to rerun; existing amendments are preserved.')
    if not 2 <= max_align <= 8: raise ValueError('max-align must be between 2 and 8')
    texts = verify_sources(project)
    from .project_inference import infer
    manifest.update(status='running', error=None); write_json(project/'project.json',manifest)
    stage = Path(tempfile.mkdtemp(prefix='.macronic-run-', dir=project.parent))
    try:
        shutil.copytree(project, stage, dirs_exist_ok=True)
        infer(stage, texts, max_align)
        subprocess.run(['node', str(ROOT/'scripts/project.mjs'), 'export', str(stage)], check=True)
        # Commit completed outputs only after the shared JS validators/export succeed.
        for name in ['data/candidates','data/reviewed','data/evidence','data/reader','src']:
            source=stage/name; target=project/name
            target.parent.mkdir(parents=True,exist_ok=True)
            shutil.copytree(source,target,dirs_exist_ok=True)
        shutil.copyfile(stage/'data/samples/sentences.json',project/'data/samples/sentences.json')
        manifest.update(status='prepared',error=None)
    except Exception as error:
        manifest.update(status='failed',error=str(error)); raise
    finally:
        write_json(project/'project.json',manifest); shutil.rmtree(stage)


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='command',required=True)
    create=sub.add_parser('create',help='Import two texts; prepare them unless --sources-only is given')
    create.add_argument('english');create.add_argument('translation');create.add_argument('--output',required=True)
    create.add_argument('--title',required=True);create.add_argument('--target-language',default='fr')
    create.add_argument('--english-edition',required=True);create.add_argument('--target-edition',required=True)
    create.add_argument('--english-url',default='');create.add_argument('--target-url',default='');create.add_argument('--rights',default='Unspecified')
    create.add_argument('--sources-only',action='store_true')
    run=sub.add_parser('run',help='Prepare a previously imported project');run.add_argument('project');run.add_argument('--max-align',type=int,default=5)
    args=vars(parser.parse_args());command=args.pop('command')
    try:
        if command=='create':
            sources_only=args.pop('sources_only');project=create_project(**args)
            print(f'Imported source project: {project}',flush=True)
            if not sources_only: run_project(project)
        else: project=Path(args.pop('project'));run_project(project,**args)
        print(f'Project saved: {project}')
    except (ValueError, OSError, ImportError, subprocess.CalledProcessError) as error:
        parser.exit(1, f'Preparation stopped: {error}\nInstall pipeline/requirements.lock.txt and download the pinned models before running inference. Imported sources are retained.\n')

if __name__=='__main__': main()
