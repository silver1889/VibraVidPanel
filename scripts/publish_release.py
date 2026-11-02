"""Publish an explicitly requested GitHub release; never overwrite a release."""
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from verify_release import verify

ROOT=Path(__file__).resolve().parents[1]

def main():
    folder=Path(sys.argv[1]).resolve()
    verify(folder)
    info=json.loads((folder/'release.json').read_text())
    repository=os.environ.get('GITHUB_REPOSITORY','')
    commit=os.environ.get('GITHUB_SHA','')
    if not repository or info['repository']!=repository or not re.fullmatch('[0-9a-fA-F]{40}',commit):
        raise ValueError('Run this script only from the release workflow for the matching repository')
    tag='v'+info['version']
    existing=subprocess.run(['gh','release','view',tag,'--repo',repository],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if existing.returncode==0:raise ValueError('Release already exists; increment the version instead of overwriting it')
    existing_tag=subprocess.run(['gh','api','repos/'+repository+'/git/ref/tags/'+tag],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    if existing_tag.returncode==0:raise ValueError('Tag already exists; use a new version so source and binaries stay aligned')
    notes=folder/'release-notes.md'
    notes.write_text('VibraVid Panel '+info['version']+'\n\n'
        'Compatibilità verificata: Jellyfin 10.11.11 e GUI VibraVid 1.4.9.\n\n'
        '- Installazione manuale: asset con suffisso -Installazione.zip.\n'
        '- Catalogo Jellyfin: aggiungi il feed https://github.com/'+repository+'/releases/latest/download/manifest.json\n'
        '- Sorgenti: https://github.com/'+repository+'/tree/'+tag+'\n\n'
        'Guida: GUIDA-INSTALLAZIONE.md nel pacchetto manuale e nel repository.\n'
        'Changelog: https://github.com/'+repository+'/blob/'+tag+'/CHANGELOG.md\n',encoding='utf-8')
    subprocess.run(['gh','release','create',tag,'--repo',repository,'--target',commit,
        '--title','VibraVid Panel '+info['version'],'--notes-file',str(notes),'--draft',
        *[str(folder/name) for name in info['assets']]],check=True)
    subprocess.run(['gh','release','edit',tag,'--repo',repository,'--draft=false','--latest'],check=True)

if __name__=='__main__':main()
