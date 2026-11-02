(function(){
 'use strict';
 if(window.VibraVidViewport)return;
 window.VibraVidViewport={attach:function(frame,container){
  var viewport=window.visualViewport,keyboard=window.navigator.virtualKeyboard;
  var editing=false,baseline=viewport?viewport.height:window.innerHeight,width=window.innerWidth,pending=0,disposed=false;
  var pressing=false,releaseTimer=0,pressGuard=0;
  function schedule(){if(!pending&&!disposed&&!pressing)pending=requestAnimationFrame(update);}
  function update(){
   pending=0;if(disposed||pressing||!frame.isConnected)return;
   var top=viewport?viewport.offsetTop:0,height=viewport?viewport.height:window.innerHeight;
   var obscured=keyboard&&keyboard.boundingRect?keyboard.boundingRect.height:0;
   if(width!==window.innerWidth){width=window.innerWidth;baseline=height;}
   if(!editing)baseline=Math.max(baseline,height);
   var compact=editing&&(baseline-height>100||obscured>100);
   container.classList.toggle('vp-keyboard',compact);
   var rect=frame.getBoundingClientRect();
   var bottom=top+height;
   if(obscured>100)bottom=Math.min(bottom,window.innerHeight-obscured);
   var available=Math.max(120,Math.floor(bottom-Math.max(top,rect.top)-8));
   if(frame.style.height!==available+'px')frame.style.height=available+'px';
   frame.style.minHeight='120px';
   frame.contentWindow.postMessage({type:'vibravid-viewport',keyboard:compact,top:Math.max(0,top-rect.top)+12,bottom:Math.min(available,bottom-rect.top)-12},'*');
  }
  function message(event){
   if(event.source!==frame.contentWindow||!event.data)return;
   if(event.data.type==='vibravid-press'){
    clearTimeout(releaseTimer);clearTimeout(pressGuard);
    if(event.data.active===true){
     pressing=true;if(pending){cancelAnimationFrame(pending);pending=0;}
     pressGuard=setTimeout(function(){pressing=false;schedule();},2000);
    }else releaseTimer=setTimeout(function(){pressing=false;schedule();},180);
    return;
   }
   if(event.data.type!=='vibravid-editing')return;
   editing=event.data.active===true;schedule();
  }
  window.addEventListener('message',message);
  window.addEventListener('resize',schedule);
  if(viewport){viewport.addEventListener('resize',schedule);viewport.addEventListener('scroll',schedule);}
  if(keyboard)keyboard.addEventListener('geometrychange',schedule);
  frame.addEventListener('load',schedule);schedule();
  return function(){
   disposed=true;if(pending)cancelAnimationFrame(pending);clearTimeout(releaseTimer);clearTimeout(pressGuard);
   window.removeEventListener('message',message);window.removeEventListener('resize',schedule);
   if(viewport){viewport.removeEventListener('resize',schedule);viewport.removeEventListener('scroll',schedule);}
   if(keyboard)keyboard.removeEventListener('geometrychange',schedule);
   frame.removeEventListener('load',schedule);container.classList.remove('vp-keyboard');
  };
 }};
}());
