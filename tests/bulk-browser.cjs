// Exercise both native GUI handlers against the opaque, sandboxed proxy frame.
module.exports = async function bulkCheck(page, frame, c, check, label) {
  const posts=[], native=[];
  const onRequest=r=>{if(r.method()==='POST'&&new URL(r.url()).pathname.endsWith('/series-detail/'))posts.push(r);};
  const onDialog=async d=>{native.push(d.type());await d.dismiss();};
  page.on('request',onRequest);page.on('dialog',onDialog);
  async function activity() {
    const response=await fetch(c.base+'/System/ActivityLog/Entries?limit=500',{headers:{'X-Emby-Token':c.adminToken}});
    if(!response.ok)throw Error('Activity query failed');
    return (await response.json()).Items.filter(e=>e.Type==='VibraVidDownloadStarted');
  }
  const initial=(await activity()).length;
  async function details(){
    await frame.getByRole('link',{name:'Serie di prova',exact:true}).click();
    await frame.getByRole('heading',{name:'Serie di prova in blocco',exact:true}).waitFor();
  }
  try {
    await details();
    await check(label+': bulk confirmation opens inside the panel and cancellation sends nothing',async()=>{
      await frame.getByRole('button',{name:'Download all',exact:true}).click();
      const dialog=frame.getByRole('dialog',{name:'Conferma download',exact:true});
      await dialog.waitFor({timeout:3000});
      if(!(await dialog.innerText()).includes('Serie in blocco di prova'))throw Error('Series title missing');
      await dialog.getByRole('button',{name:'Annulla',exact:true}).click();
      await dialog.waitFor({state:'detached'});await page.waitForTimeout(100);
      if(posts.length||(await activity()).length!==initial)throw Error('Cancel started a download');
      await frame.getByRole('button',{name:'Download all',exact:true}).click();
      await dialog.waitFor();await page.keyboard.press('Escape');
      await dialog.waitFor({state:'detached'});
      if(posts.length)throw Error('Escape started a download');
    });
    await check(label+': approving Download all sends exactly one batch and one activity',async()=>{
      await frame.getByRole('button',{name:'Download all',exact:true}).click();
      const dialog=frame.getByRole('dialog',{name:'Conferma download',exact:true});
      await dialog.waitFor();
      const reply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/series-detail/'));
      await dialog.getByRole('button',{name:'Scarica tutte le stagioni',exact:true}).evaluate(button=>{button.click();button.click();});
      const response=await reply;
      await frame.getByRole('heading',{name:'In coda sul NAS di prova',exact:true}).waitFor();
      if(response.status()!==302||posts.length!==1)throw Error('Expected one accepted batch');
      const data=new URLSearchParams(posts[0].postData());
      for(const [key,value] of Object.entries({download_type:'full_series',csrfmiddlewaretoken:'fixture-csrf',audio_language:'it',manual_tracks:'on',fixture_submit_handler:'kept'}))
        if(data.get(key)!==value)throw Error('Bulk field changed: '+key);
      const current=await activity();
      if(current.length!==initial+1||!current.some(e=>e.Name.includes('Serie in blocco di prova')&&e.Name.includes('serie completa (tutte le stagioni)')))throw Error('Batch activity missing or duplicated');
    });
    await details();
    await check(label+': selected seasons retain their selection and send one batch',async()=>{
      await frame.getByRole('checkbox',{name:'Stagione 1',exact:true}).check();
      await frame.getByRole('checkbox',{name:'Stagione 3',exact:true}).check();
      await frame.locator('#cn-seasons-btn').click();
      const dialog=frame.getByRole('dialog',{name:'Conferma download',exact:true});await dialog.waitFor();
      if(!(await dialog.innerText()).includes('1, 3'))throw Error('Selected seasons missing');
      await dialog.getByRole('button',{name:'Annulla',exact:true}).click();
      if(posts.length!==1)throw Error('Cancelled selection sent');
      await frame.locator('#cn-seasons-btn').click();
      const reply=page.waitForResponse(r=>r.request().method()==='POST'&&new URL(r.url()).pathname.endsWith('/series-detail/'));
      await dialog.getByRole('button',{name:'Scarica stagioni selezionate',exact:true}).click();
      if((await reply).status()!==302)throw Error('Seasons request failed');
      await frame.getByRole('heading',{name:'In coda sul NAS di prova',exact:true}).waitFor();
      if(posts.length!==2)throw Error('Season batch duplicated');
      const data=new URLSearchParams(posts[1].postData());
      if(data.get('download_type')!=='selected_seasons'||data.get('selected_seasons')!=='1,3'||data.get('fixture_submit_handler')!=='kept')throw Error('Season fields changed');
      if((await activity()).length!==initial+2)throw Error('Season activity missing or duplicated');
      if(native.length)throw Error('Native browser popup used');
      await frame.getByRole('link',{name:'Ricerca',exact:true}).click();
      await frame.locator('input[name=query]').waitFor();
    });
  } finally {page.off('request',onRequest);page.off('dialog',onDialog);}
};
