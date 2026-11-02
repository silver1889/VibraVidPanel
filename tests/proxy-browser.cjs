const fs = require('node:fs');
const path = require('node:path');
const c = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const { chromium } = require(require.resolve('playwright', { paths: [c.nodeModules] }));
const bulkCheck = require('./bulk-browser.cjs');
(async () => {
  const browser = await chromium.launch({ channel:'chrome', headless:true });
  const checks=[], errors=[], direct=[];
  const context = await browser.newContext({viewport:{width:1280,height:900}});
  const page = await context.newPage();
  const guiOrigin = new URL(c.guiUrl).origin;
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin === guiOrigin) { direct.push(route.request().url()); await route.abort(); }
    else await route.continue();
  });
  page.on('pageerror', e=>errors.push(e.message));
  async function check(name,fn) { await fn(); checks.push(name); console.log('PASS '+name); }
  async function login(p,user,withoutMenu=false) {
    await p.goto(c.base+'/web/#/login');
    await p.getByRole('textbox').first().fill(user);
    await p.locator('input[type=password]').fill(c.password);
    await p.getByRole('button',{name:'Accedi',exact:true}).click();
    await p.waitForURL(u=>u.hash.startsWith('#/home'));
    await p.getByRole('heading',{name:'I miei media',exact:true}).waitFor();
    if(!withoutMenu)await p.locator('[data-vibravid-menu]').waitFor({state:'attached'});
  }
  async function save(patch={}) {
    const r=await fetch(c.base+'/VibraVidPanel/settings',{method:'POST',headers:{'X-Emby-Token':c.adminToken,'Content-Type':'application/json'},
      body:JSON.stringify({Enabled:true,GuiUrl:c.guiUrl,MenuTitle:'Scarica film / serie TV',OpenMode:'proxy',OnlyAdministrators:false,...patch})});
    if(r.status!==204)throw Error('save '+r.status);
  }
  try {
    await login(page,'panel-user');
    await page.locator('.mainDrawerButton').click();
    await page.locator('[data-vibravid-menu]').click();
    const frame=page.frameLocator('#vibravid-panel iframe');
    await check('GUI opens inside Jellyfin while direct LAN access is blocked',async()=>{
      await frame.getByRole('heading',{name:'VibraVid',exact:true}).waitFor();
      if(!page.url().startsWith(c.base+'/web/'))throw Error('Left Jellyfin');
      if(context.pages().length!==1)throw Error('New tab opened');
      if(direct.length)throw Error('Direct GUI access attempted');
    });
    await check('static assets and API polling use the proxy',async()=>{
      await frame.locator('#progress').filter({hasText:'43%'}).waitFor();
      await frame.locator('#storage').filter({hasText:'ok'}).waitFor();
    });
    await check('Jellyfin plugin page opens without the browser menu loader',async()=>{
      const appContext=await browser.newContext({viewport:{width:390,height:844}});
      await appContext.route('**/*',async route=>{
        const request=route.request();
        if(new URL(request.url()).origin===guiOrigin){direct.push(request.url());await route.abort();return;}
        if(request.resourceType()==='document'&&new URL(request.url()).pathname.match(/\/web\/(?:index\.html)?$/)){
          const response=await route.fetch();
          const html=(await response.text()).replace(/<script\b[^>]*\bid="vibravid-panel-loader"[^>]*><\/script>/g,'');
          await route.fulfill({response,body:html});return;
        }
        await route.continue();
      });
      const app=await appContext.newPage();app.on('pageerror',e=>{errors.push(e.stack||e.message);console.error('APP PAGE ERROR '+e.stack);});
      await login(app,'panel-admin',true);
      if(await app.evaluate(()=>typeof window.VibraVidPanel)!=='undefined')throw Error('Menu loader still present');
      for(let i=0;i<2;i++){
        await app.goto(c.base+'/web/#/configurationpage?name=VibraVidDownloads');
        const embedded=app.frameLocator('#vibravidDownloadsPage iframe');
        await embedded.getByRole('heading',{name:'VibraVid',exact:true}).waitFor();
        await embedded.locator('#progress').filter({hasText:'43%'}).waitFor();
        if(i===0){
          const input=embedded.locator('input[name=query]');await input.focus();
          await app.setViewportSize({width:390,height:430});
          await app.waitForFunction(()=>document.querySelector('#vibravidDownloadsPage')?.classList.contains('vp-keyboard'));
          await app.waitForTimeout(350);
          const box=await input.boundingBox();
          if(!box||box.y<0||box.y+box.height>422)throw Error('Focused search is covered in the reduced keyboard viewport');
          await app.screenshot({path:path.join(c.lab,c.prefixOnly?'keyboard-prefix.png':'keyboard-mobile.png')});
          const search=embedded.getByRole('button',{name:'Cerca',exact:true});
          const target=await search.boundingBox();
          await app.mouse.move(target.x+target.width/2,target.y+target.height/2);
          await app.mouse.down();
          await app.setViewportSize({width:390,height:844});
          await app.waitForTimeout(150);
          await app.mouse.up();
          await embedded.getByRole('heading',{name:'Risultati',exact:true}).waitFor({timeout:5000});
          await app.setViewportSize({width:390,height:844});
          const child=app.frames().find(f=>f.url().includes('/VibraVidPanel/gui/'));await child.evaluate(()=>document.activeElement.blur());
          await app.waitForFunction(()=>!document.querySelector('#vibravidDownloadsPage')?.classList.contains('vp-keyboard'));
        }
        if(i===0)await bulkCheck(app,embedded,c,check,c.prefixOnly?'BaseUrl app':'Mobile app');
        if(!await app.locator('[data-vpd-settings]').isVisible())throw Error('Administrator settings button missing');
        const url=await app.locator('#vibravidDownloadsPage iframe').getAttribute('src');
        await app.locator('[data-vpd-back]').click();
        await app.waitForURL(u=>u.hash.startsWith('#/home'));
        await app.getByRole('heading',{name:'I miei media',exact:true}).waitFor();
        await app.waitForTimeout(150);
        if((await fetch(url)).status!==401)throw Error('Plugin page session not revoked');
      }
      await appContext.close();
    });
    if(c.prefixOnly){
      fs.writeFileSync(path.join(c.lab,'browser-prefix-report.json'),JSON.stringify({checks,pageErrors:errors},null,2));return;
    }
    await check('GUI cannot read Jellyfin storage',async()=>{
      await frame.locator('#isolation').filter({hasText:'isolato'}).waitFor();
      const child=page.frames().find(f=>f.url().includes('/VibraVidPanel/gui/'));
      if(await child.evaluate(()=>document.cookie.includes('sessionid')))throw Error('HttpOnly cookie exposed');
      if(await child.evaluate(()=>window.fixtureData.output_path)!=='/downloads/Film')throw Error('JSON filesystem path rewritten');
      if(await frame.locator('#fixture-folder').inputValue()!=='/downloads/Film')throw Error('Input filesystem path rewritten');
      if(await frame.locator('#fixture-config').inputValue()!== '{"path":"/downloads/Film"}')throw Error('Textarea configuration rewritten');
      if(await child.evaluate(()=>JSON.parse(document.querySelector('#fixture-json').textContent).path)!=='/downloads/Film')throw Error('JSON script configuration rewritten');
    });
    await bulkCheck(page,frame,c,check,'Web overlay');
    await check('search form remains inside embedded GUI',async()=>{
      await frame.getByRole('button',{name:'Cerca',exact:true}).click();
      await frame.getByRole('heading',{name:'Risultati',exact:true}).waitFor();
    });
    await check('POST download and redirect retain cookies and CSRF',async()=>{
      await frame.getByRole('button',{name:'Scarica sul NAS di prova'}).click();
      await frame.getByRole('heading',{name:'In coda sul NAS di prova'}).waitFor();
      await frame.locator('#progress').filter({hasText:'43%'}).waitFor();
      if(!page.url().startsWith(c.base+'/web/'))throw Error('Left Jellyfin');
    });
    await page.screenshot({path:path.join(c.lab,'panel-desktop.png')});
    await check('phone viewport stays inside Jellyfin',async()=>{
      await page.setViewportSize({width:390,height:844});
      if(await page.locator('#vibravid-panel').evaluate(e=>e.scrollWidth>e.clientWidth))throw Error('Overflow');
      await page.screenshot({path:path.join(c.lab,'panel-mobile.png')});
    });
    await check('regular user has no plugin settings button',async()=>{
      if(await page.locator('#vibravid-panel').getByRole('button',{name:'Impostazioni',exact:true}).count())throw Error('Admin button exposed');
    });
    await check('closing revokes GUI session',async()=>{
      const url=await page.locator('#vibravid-panel iframe').getAttribute('src');
      await page.locator('#vibravid-panel').getByRole('button',{name:'Jellyfin',exact:false}).click();
      await page.waitForTimeout(250);
      if((await fetch(url)).status!==401)throw Error('Closed session valid');
    });
    const adminContext=await browser.newContext({viewport:{width:1280,height:950}});
    await adminContext.route('**/*',async route=>{
      if(new URL(route.request().url()).origin===guiOrigin){direct.push(route.request().url());await route.abort();}else await route.continue();
    });
    const admin=await adminContext.newPage();admin.on('pageerror',e=>errors.push(e.message));
    await login(admin,'panel-admin');
    await check('native Jellyfin dashboard displays the download activities',async()=>{
      await admin.goto(c.base+'/web/#/dashboard');
      // The dashboard shows only seven recent events; browser logins can push
      // the earlier movie/season examples into the full activity history.
      await admin.getByText(/^panel-user ha avviato il download con VibraVid di:/).first().waitFor();
      await admin.screenshot({path:path.join(c.lab,'activity-dashboard.png'),fullPage:true});
      await admin.goto(c.base+'/web/#/home');
      await admin.getByRole('heading',{name:'I miei media',exact:true}).waitFor();
    });
    await check('settings can be reopened and changed repeatedly',async()=>{
      for(let i=0;i<3;i++){
        await admin.evaluate(()=>{location.hash='#/configurationpage?name=VibraVidPanel';});
        await admin.locator('#vibravidGuiUrl').waitFor({state:'visible'});
        await admin.waitForFunction(u=>document.querySelector('#vibravidGuiUrl')?.value===u,c.guiUrl);
        await admin.locator('#vibravidMenuTitle').fill('Download di prova '+i);
        await admin.getByRole('button',{name:'Salva',exact:true}).click();
        await admin.getByText('Impostazioni salvate.',{exact:true}).waitFor();
        const cfg=await(await fetch(c.base+'/VibraVidPanel/settings',{headers:{'X-Emby-Token':c.adminToken}})).json();
        if(cfg.MenuTitle!=='Download di prova '+i)throw Error('Settings not updated');
        await admin.evaluate(()=>{location.hash='#/home';});
        await admin.getByRole('heading',{name:'I miei media',exact:true}).waitFor();
      }
    });
    await check('settings remain reachable from open GUI',async()=>{
      await admin.evaluate(()=>window.VibraVidPanel.open());
      await admin.frameLocator('#vibravid-panel iframe').getByRole('heading',{name:'VibraVid',exact:true}).waitFor();
      await admin.locator('#vibravid-panel').getByRole('button',{name:'Impostazioni',exact:true}).click();
      await admin.locator('#vibravidGuiUrl').waitFor({state:'visible'});
      if(await admin.locator('#vibravid-panel').count())throw Error('Settings obstructed by overlay');
    });
    await save();
    await check('settings change revokes old GUI sessions',async()=>{
      const r=await fetch(c.base+'/VibraVidPanel/session',{method:'POST',headers:{'X-Emby-Token':c.userToken}});
      const lease=await r.json();await save();
      if((await fetch(c.base+lease.Url)).status!==401)throw Error('Old settings session valid');
    });
    await check('revoked Jellyfin token invalidates proxy session',async()=>{
      const signedIn=await(await fetch(c.base+'/Users/AuthenticateByName',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'MediaBrowser Client="Proxy logout test",Device="Loopback",DeviceId="proxy-revocation-test",Version="1.0"'},body:JSON.stringify({Username:'panel-user',Pw:c.password})})).json();
      const temporaryToken=signedIn.AccessToken;
      const r=await fetch(c.base+'/VibraVidPanel/session',{method:'POST',headers:{'X-Emby-Token':temporaryToken}});
      const lease=await r.json();
      await fetch(c.base+'/Sessions/Logout',{method:'POST',headers:{'X-Emby-Token':temporaryToken}});
      if((await fetch(c.base+lease.Url)).status!==401)throw Error('Logged-out session valid');
    });
    if(errors.length)throw Error('Browser errors: '+errors.join('; '));
    if(direct.length)throw Error('LAN requests: '+direct.length);
    fs.writeFileSync(path.join(c.lab,'browser-report.json'),JSON.stringify({browser:'Chrome',checks,pageErrors:errors,directLanRequests:direct.length},null,2));
  } catch(e){
    await page.screenshot({path:path.join(c.lab,'failure.png')}).catch(()=>{});
    console.error('PAGES',JSON.stringify(await Promise.all(browser.contexts().flatMap(x=>x.pages()).map(async p=>({url:p.url(),body:(await p.locator('body').innerText().catch(()=>'' )).slice(0,3000)})))));
    console.error('FRAMES',JSON.stringify(await Promise.all(page.frames().map(async f=>({url:f.url(),body:(await f.locator('body').innerText().catch(()=>'' )).slice(0,3000)})))));
    throw e;
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
