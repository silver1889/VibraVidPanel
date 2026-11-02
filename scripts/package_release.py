"""Build manual/catalog ZIPs from an explicit allowlist. Standard library only."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import re
import stat
import zipfile
from xml.etree import ElementTree as ET

ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT/'src/VibraVidPanel/VibraVidPanel.csproj'
PLUGIN_ID='76d721a9-6529-4f75-a2d5-d9a15fd2cf93'
BINARIES=('Jellyfin.Plugin.VibraVidPanel.dll','Jellyfin.Plugin.VibraVidPanel.deps.json')

def write_zip(path,files):
    for name,data in files.items():
        if name.startswith(('/', '\\')) or '..' in Path(name).parts:
            raise ValueError('Unsafe archive path')
        if re.search(rb'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',data):
            raise ValueError('Private key material must not be packaged')
    with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,data in sorted(files.items()):
            entry=zipfile.ZipInfo(name)
            entry.create_system=3
            entry.external_attr=(stat.S_IFREG|0o644)<<16
            entry.compress_type=zipfile.ZIP_DEFLATED
            archive.writestr(entry,data)
    with zipfile.ZipFile(path) as archive:
        if archive.testzip() is not None or set(archive.namelist())!=set(files):
            raise ValueError('ZIP verification failed')

def valid_repository(value):
    if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_.-]{1,100}',value) or value.split('/')[-1] in ('.','..'):
        raise argparse.ArgumentTypeError('Use the GitHub repository name OWNER/REPOSITORY')
    return value

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-dir',type=Path,default=ROOT/'build')
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    parser.add_argument('--repository',type=valid_repository)
    args=parser.parse_args()
    project=ET.parse(PROJECT).getroot()
    version=project.findtext('PropertyGroup/Version')
    abi=project.findtext('PropertyGroup/JellyfinVersion')+'.0'
    if not re.fullmatch(r'\d+\.\d+\.\d+\.\d+',version):raise ValueError('Invalid project version')
    output=args.output.resolve()
    output.mkdir(parents=True,exist_ok=True)
    binaries={name:(args.build_dir/name).read_bytes() for name in BINARIES}
    deps=json.loads(binaries[BINARIES[1]])
    if 'Jellyfin.Plugin.VibraVidPanel/'+version not in deps['libraries']:
        raise ValueError('Compile the same version before packaging')
    meta=dict(category='General',description='GUI VibraVid dentro Jellyfin tramite il server.',
              guid=PLUGIN_ID,name='VibraVid Panel',overview='Apri la GUI del tuo servizio VibraVid in Jellyfin.',
              owner=args.repository.split('/')[0] if args.repository else '',targetAbi=abi,
              version=version,status='Active',autoUpdate=False,assemblies=[])
    plugin={**binaries,'meta.json':(json.dumps(meta,ensure_ascii=False,indent=2)+'\n').encode()}
    guide=(ROOT/'docs/INSTALLAZIONE.template.md').read_text(encoding='utf-8').replace('{{VERSION}}',version)
    source_url='https://github.com/'+args.repository+'/tree/v'+version if args.repository else 'il repository GitHub che distribuisce questo pacchetto'
    notices={'LICENSE':(ROOT/'LICENSE').read_bytes(),'NOTICE.md':(ROOT/'NOTICE.md').read_bytes(),
             'SORGENTI.txt':('VibraVid Panel '+version+'\nLicenza: GNU GPL versione 3.\n'
                             'Codice sorgente corrispondente: '+source_url+' (cartella src).\n').encode()}
    catalog=output/('VibraVidPanel-'+version+'.zip')
    write_zip(catalog,{**plugin,**notices})
    manual_files={'VibraVidPanel_'+version+'/'+name:data for name,data in plugin.items()}
    manual_files.update(notices)
    manual_files['GUIDA-INSTALLAZIONE.md']=guide.encode()
    manual_files['LEGGIMI.txt']=('VibraVid Panel '+version+' per Jellyfin 10.11.11\n\n'
        '1. Verifica che la GUI VibraVid sia gia funzionante.\n'
        '2. Arresta Jellyfin e copia la cartella VibraVidPanel_'+version+' nella directory plugins.\n'
        '3. Avvia Jellyfin e configura VibraVid Panel in Pannello di controllo > Plugin.\n'
        '4. Inserisci l\'URL della GUI raggiungibile dal server Jellyfin e salva.\n'
        '5. Apri Scarica film / serie TV.\n\nLeggi GUIDA-INSTALLAZIONE.md per i dettagli.\n').encode()
    manual_files['SHA256SUMS.txt']=''.join(hashlib.sha256(data).hexdigest()+'  '+name+'\n' for name,data in sorted(manual_files.items())).encode()
    manual=output/('VibraVidPanel-'+version+'-Installazione.zip')
    write_zip(manual,manual_files)
    assets=[catalog.name,manual.name]
    if args.repository:
        manifest=[dict(guid=PLUGIN_ID,name='VibraVid Panel',overview='GUI VibraVid dentro Jellyfin.',
            description='Pannello VibraVid con proxy del server, interfaccia mobile e registro attività.',
            owner=args.repository.split('/')[0],category='General',versions=[dict(version=version,
            changelog='Consulta CHANGELOG.md nel repository.',targetAbi=abi,
            sourceUrl='https://github.com/'+args.repository+'/releases/download/v'+version+'/'+catalog.name,
            checksum=hashlib.md5(catalog.read_bytes(),usedforsecurity=False).hexdigest(),
            timestamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'))])]
        (output/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        assets.append('manifest.json')
    elif (output/'manifest.json').exists():
        raise ValueError('Use an empty output directory when changing repository mode')
    (output/'SHA256SUMS.txt').write_text(''.join(hashlib.sha256((output/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in sorted(assets)),encoding='utf-8')
    assets.append('SHA256SUMS.txt')
    summary=dict(version=version,targetAbi=abi,repository=args.repository,assets=assets)
    (output/'release.json').write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    (output/'GUIDA-INSTALLAZIONE.md').write_text(guide,encoding='utf-8')
    print(json.dumps(summary))

if __name__=='__main__':main()
