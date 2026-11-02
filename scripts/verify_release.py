"""Check the packages, catalog layout, version and checksums before publication."""
import hashlib
import json
from pathlib import Path,PurePosixPath
import sys
import zipfile

def require(condition,message):
    if not condition:raise ValueError(message)

def verify(folder):
    info=json.loads((folder/'release.json').read_text(encoding='utf-8'))
    version=info['version']
    catalog_name='VibraVidPanel-'+version+'.zip'
    manual_name='VibraVidPanel-'+version+'-Installazione.zip'
    for line in (folder/'SHA256SUMS.txt').read_text().splitlines():
        digest,name=line.split('  ',1)
        require(Path(name).name==name,'Unsafe checksum filename')
        require(hashlib.sha256((folder/name).read_bytes()).hexdigest()==digest,'Asset checksum mismatch')
    with zipfile.ZipFile(folder/catalog_name) as catalog,zipfile.ZipFile(folder/manual_name) as manual:
        for archive in (catalog,manual):
            require(archive.testzip() is None,'Corrupt ZIP')
            for name in archive.namelist():
                require(not PurePosixPath(name).is_absolute() and '..' not in PurePosixPath(name).parts,'Unsafe ZIP path')
                require(not any(part in ('test-output','.cache','bin','obj') for part in PurePosixPath(name).parts),'Development output in ZIP')
        expected={'Jellyfin.Plugin.VibraVidPanel.dll','Jellyfin.Plugin.VibraVidPanel.deps.json','meta.json','LICENSE','NOTICE.md','SORGENTI.txt'}
        require(set(catalog.namelist())==expected,'Catalog DLL must be at ZIP root')
        prefix='VibraVidPanel_'+version+'/'
        for name in ('Jellyfin.Plugin.VibraVidPanel.dll','Jellyfin.Plugin.VibraVidPanel.deps.json','meta.json'):
            require(catalog.read(name)==manual.read(prefix+name),'Manual/catalog plugin mismatch')
        meta=json.loads(catalog.read('meta.json'))
        require(meta['version']==version and meta['targetAbi']==info['targetAbi'],'Metadata version mismatch')
        require('Jellyfin.Plugin.VibraVidPanel/'+version in json.loads(catalog.read('Jellyfin.Plugin.VibraVidPanel.deps.json'))['libraries'],'Dependency version mismatch')
        for line in manual.read('SHA256SUMS.txt').decode().splitlines():
            digest,name=line.split('  ',1)
            require(hashlib.sha256(manual.read(name)).hexdigest()==digest,'Manual member checksum mismatch')
    if info['repository']:
        manifest=json.loads((folder/'manifest.json').read_text())[0]
        release=manifest['versions'][0]
        require(manifest['guid']==meta['guid'],'Plugin GUID mismatch')
        require(release['version']==version and release['targetAbi']==info['targetAbi'],'Manifest version mismatch')
        require(release['checksum']==hashlib.md5((folder/catalog_name).read_bytes(),usedforsecurity=False).hexdigest(),'Catalog MD5 mismatch')
        expected_url='https://github.com/'+info['repository']+'/releases/download/v'+version+'/'+catalog_name
        require(release['sourceUrl']==expected_url,'Release URL mismatch')
    print(json.dumps({'verified':True,'version':version,'catalog_layout':'root DLL','assets':len(info['assets'])}))

if __name__=='__main__':verify(Path(sys.argv[1]))
