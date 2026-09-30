"use strict";

const tests = [
  {id:"resolution",name:"Resolution",subtitle:"Spatial frequency response",icon:"▥",chart:"ISO 12233",file:"iso12233 chart.bmp",desc:"Measure MTF50, MTF20, MTF10, and Nyquist modulation from a slanted edge."},
  {id:"color",name:"Color Reproduction",subtitle:"Color accuracy",icon:"◒",chart:"24-patch ColorChecker",file:"24 color checker.bmp",desc:"Compare 24 measured patches with ColorChecker Classic sRGB reference values."},
  {id:"whiteBalance",name:"White Balance",subtitle:"Neutral balance",icon:"◐",chart:"24-patch ColorChecker",file:"24 color checker.bmp",desc:"Assess RGB balance using the neutral patches in the bottom row."},
  {id:"grayScale",name:"Gray Scale",subtitle:"Tonal response",icon:"▤",chart:"24-patch ColorChecker",file:"24 color checker.bmp",desc:"Evaluate luminance ordering and reference differences for six neutral patches."},
  {id:"snr",name:"S/N Ratio",subtitle:"Spatial noise",icon:"⌁",chart:"24-patch ColorChecker",file:"24 color checker.bmp",desc:"Estimate single-image spatial SNR from neutral-patch variation."},
  {id:"uniformity",name:"Brightness Uniformity",subtitle:"Illumination uniformity",icon:"◉",chart:"White field",file:"white chart.bmp",desc:"Compare brightness at nine positions with the center measurement."},
  {id:"distortion",name:"Distortion",subtitle:"Grid-line curvature",icon:"▦",chart:"Checkerboard",file:"distortion chart.bmp",desc:"Detect checkerboard corners and estimate horizontal and vertical grid-line curvature."}
];
const defaults = {
  resolution:{x:.458,y:.235,w:.034,h:.19},
  checker:{x:.116,y:.072,w:.738,h:.867}, uniformity:{x:0,y:0,w:1,h:1},
  distortion:{x:.08,y:.03,w:.84,h:.95}
};
const $=id=>document.getElementById(id);
const nav=$("testNav"),canvas=$("imageCanvas"),ctx=canvas.getContext("2d",{willReadFrequently:true});
const stage=$("canvasStage"),fileInput=$("fileInput");
const state={index:0,img:null,imageData:null,filename:"",source:"sample",zoom:1,rois:structuredClone(defaults),corners:null,drag:null,result:null,uploads:{},imageToken:0};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const fmt=(v,n=1)=>Number.isFinite(v)?v.toFixed(n):"—";
const rgbHex=rgb=>`#${rgb.map(v=>clamp(Math.round(v),0,255).toString(16).padStart(2,"0")).join("").toUpperCase()}`;
const safe=s=>String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"})[c]);
const current=()=>tests[state.index];
const roiKey=()=>["color","whiteBalance","grayScale","snr"].includes(current().id)?"checker":current().id;
function invalidateResult(){state.result=null;state.corners=null;$("resultState").textContent="Pending";$("resultState").className="state-pill";$("exportButton").disabled=true;}
// ColorChecker Classic (legacy) sRGB reference, D65. Row-major order.
const colorCheckerReference=[
  [115,82,68],[194,150,130],[98,122,157],[87,108,67],[133,128,177],[103,189,170],
  [214,126,44],[80,91,166],[193,90,99],[94,60,108],[157,188,64],[224,163,46],
  [56,61,150],[70,148,73],[175,54,60],[231,199,31],[187,86,149],[8,133,161],
  [243,243,242],[200,200,200],[160,160,160],[122,122,121],[85,85,85],[52,52,52]
];

function buildNav(){nav.innerHTML=tests.map((t,i)=>`<button class="nav-item ${i===state.index?'active':''}" data-index="${i}" title="${t.name} · ${t.subtitle}"><span class="nav-icon">${t.icon}</span><span class="nav-copy"><strong>${t.name}</strong><small>${t.subtitle}</small></span></button>`).join("");nav.querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>selectTest(+b.dataset.index)));}
function selectTest(i){state.index=i;state.result=null;state.corners=null;buildNav();const t=current();$("categoryLabel").textContent=`${t.chart.toUpperCase()} CHART · ${String(i+1).padStart(2,"0")} / 07`;$("testTitle").innerHTML=`${t.name} <span>${t.subtitle}</span>`;$("testDescription").textContent=t.desc;$("chartBadge").textContent=t.chart;$("resultState").textContent="Pending";$("resultState").className="state-pill";$("exportButton").disabled=true;renderPanel();const upload=state.uploads[t.file];if(upload){loadImage(upload.url,upload.name,true);}else if(location.protocol==="file:"){showImagePrompt();}else{loadImage(`images/${encodeURIComponent(t.file)}`,t.file,false);}}
function showImagePrompt(){++state.imageToken;state.img=null;state.imageData=null;state.filename="";canvas.width=0;canvas.height=0;clearCursorReadout();$("imageName").textContent="—";$("imageMeta").textContent="Waiting for image";$("loading").textContent="Click Open image to select an image.";$("loading").classList.remove("hidden");$("statusText").textContent="Waiting for image";}
function loadImage(src,name,isUpload){clearCursorReadout();const token=++state.imageToken;$("loading").textContent="Loading image…";$("loading").classList.remove("hidden");const im=new Image();im.onload=()=>{if(token!==state.imageToken)return;try{const c=document.createElement("canvas");c.width=im.naturalWidth;c.height=im.naturalHeight;const cctx=c.getContext("2d",{willReadFrequently:true});cctx.drawImage(im,0,0);state.imageData=cctx.getImageData(0,0,c.width,c.height);state.img=im;state.corners=null;state.filename=name;state.source=isUpload?"upload":"sample";state.zoom=1;$("imageName").textContent=name;$("imageMeta").textContent=`${c.width} × ${c.height} px · ${isUpload?"User image":"Sample image"}`;$("loading").classList.add("hidden");$("statusText").textContent="Image loaded. Verify the selection region.";draw();renderPanel();}catch(e){showError(`Unable to read image pixels: ${e.message}. Open an image manually or serve this page over local HTTP.`);}};im.onerror=()=>{if(token===state.imageToken)showError(`Unable to load ${name}.`)};im.src=src;}
function showError(message){$("loading").textContent=message;$("loading").classList.remove("hidden");$("statusText").textContent="Load failed";$("resultContent").innerHTML=`<div class="empty-state error-text">${safe(message)}</div>`;}
function fitScale(){if(!state.img)return 1;return Math.min((stage.clientWidth-30)/state.img.naturalWidth,(stage.clientHeight-30)/state.img.naturalHeight,1);}
function draw(){
  if(!state.img)return;
  const w=state.img.naturalWidth,h=state.img.naturalHeight,s=fitScale()*state.zoom;
  canvas.width=Math.max(1,Math.round(w*s));canvas.height=Math.max(1,Math.round(h*s));
  ctx.drawImage(state.img,0,0,canvas.width,canvas.height);
  ctx.save();ctx.lineWidth=2;ctx.strokeStyle="#48ecf0";ctx.fillStyle="#48ecf022";
  const key=roiKey();
  if(key==="checker"){
    const r=state.rois.checker,x=r.x*canvas.width,y=r.y*canvas.height,rw=r.w*canvas.width,rh=r.h*canvas.height;
    ctx.strokeRect(x,y,rw,rh);
    for(let row=0;row<4;row++)for(let col=0;col<6;col++){
      const px=x+rw*(col+.5)/6,py=y+rh*(row+.5)/4,pw=rw/6*.42,ph=rh/4*.42;
      ctx.fillStyle=row===3?"#4ef0d628":"#48ecf014";ctx.fillRect(px-pw/2,py-ph/2,pw,ph);
      ctx.strokeStyle=row===3?"#56ebcb":"#4bdbdc99";ctx.strokeRect(px-pw/2,py-ph/2,pw,ph);
    }
  }else{
    const r=state.rois[key];
    if(r){ctx.fillRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);ctx.strokeRect(r.x*canvas.width,r.y*canvas.height,r.w*canvas.width,r.h*canvas.height);}
  }
  if(key==="uniformity"){
    const r=state.rois.uniformity;
    for(const yy of [.14,.5,.86])for(const xx of [.14,.5,.86]){
      const x=(r.x+r.w*xx)*canvas.width,y=(r.y+r.h*yy)*canvas.height;
      ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fillStyle="#4aecd9";ctx.fill();
    }
  }
  if(key==="distortion"&&state.corners){
    const result=state.corners,scaleX=canvas.width/(w/result.scale),scaleY=canvas.height/(h/result.scale);
    for(const line of [...result.rows,...result.cols]){
      ctx.beginPath();line.points.forEach((p,i)=>i?ctx.lineTo(p.x*scaleX,p.y*scaleY):ctx.moveTo(p.x*scaleX,p.y*scaleY));
      ctx.strokeStyle="#ffca6f88";ctx.lineWidth=1;ctx.stroke();
    }
    for(const p of result.points){ctx.beginPath();ctx.arc(p.x*scaleX,p.y*scaleY,2.4,0,Math.PI*2);ctx.fillStyle="#4bf1e4";ctx.fill();}
  }
  ctx.restore();$("zoomLabel").textContent=`${Math.round(state.zoom*100)}%`;
}
function canvasPos(e){const rect=canvas.getBoundingClientRect();return {x:clamp((e.clientX-rect.left)/rect.width,0,1),y:clamp((e.clientY-rect.top)/rect.height,0,1)};}
function clearCursorReadout(){$("cursorReadout").textContent="R: —　G: —　B: —　X: —　Y: —";}
canvas.addEventListener("pointerdown",e=>{if(!state.img)return;state.drag=canvasPos(e);canvas.setPointerCapture(e.pointerId);});
canvas.addEventListener("pointermove",e=>{if(!state.img||!state.imageData)return;const p=canvasPos(e),d=state.imageData,x=clamp(Math.floor(p.x*d.width),0,d.width-1),y=clamp(Math.floor(p.y*d.height),0,d.height-1),i=(y*d.width+x)*4;$("cursorReadout").textContent=`R: ${d.data[i]}　G: ${d.data[i+1]}　B: ${d.data[i+2]}　X: ${x}　Y: ${y}`;if(state.drag){const x=Math.min(state.drag.x,p.x),y=Math.min(state.drag.y,p.y);state.rois[roiKey()]={x,y,w:Math.abs(p.x-state.drag.x),h:Math.abs(p.y-state.drag.y)};draw();}});
canvas.addEventListener("pointerleave",()=>{if(!state.drag)clearCursorReadout();});
canvas.addEventListener("pointerup",e=>{if(!state.drag)return;const r=state.rois[roiKey()];if(r.w<.01||r.h<.01){state.rois[roiKey()]=structuredClone(defaults[roiKey()]);}state.drag=null;invalidateResult();draw();renderPanel();});
canvas.addEventListener("wheel",e=>{e.preventDefault();changeZoom(e.deltaY<0?1.15:1/1.15)},{passive:false});
function changeZoom(factor){state.zoom=clamp(state.zoom*factor,.5,4);draw();}
$("zoomIn").onclick=()=>changeZoom(1.25);$("zoomOut").onclick=()=>changeZoom(.8);$("fitButton").onclick=()=>{state.zoom=1;draw()};
$("resetButton").onclick=()=>{state.rois[roiKey()]=structuredClone(defaults[roiKey()]);invalidateResult();draw();renderPanel();};
$("uploadButton").onclick=()=>fileInput.click();fileInput.addEventListener("change",()=>{const file=fileInput.files?.[0];if(!file)return;const key=current().file;const old=state.uploads[key];if(old)URL.revokeObjectURL(old.url);const url=URL.createObjectURL(file);state.uploads[key]={url,name:file.name};invalidateResult();loadImage(url,file.name,true);fileInput.value="";});
$("analyzeButton").onclick=()=>analyze();$("exportButton").onclick=()=>{if(!state.result)return;const payload={test:current().name,chart:current().chart,image:state.filename,width:state.img.naturalWidth,height:state.img.naturalHeight,measuredAt:new Date().toISOString(),result:state.result.data,method:state.result.method};const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`camera-lab-${current().id}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);};
window.addEventListener("resize",()=>draw());

function pixels(){if(!state.imageData)throw Error("No image has been loaded.");return state.imageData;}
function region(r){const d=pixels();const x=clamp(Math.floor(r.x*d.width),0,d.width-1),y=clamp(Math.floor(r.y*d.height),0,d.height-1),w=clamp(Math.floor(r.w*d.width),1,d.width-x),h=clamp(Math.floor(r.h*d.height),1,d.height-y);return{x,y,w,h};}
function sample(r,step=2){const d=pixels(),q=region(r),arr=d.data;let n=0,R=0,G=0,B=0,Y=0,xx=0,yy=0,x2=0,y2=0,xy=0,xY=0,yY=0,Y2=0;for(let y=q.y;y<q.y+q.h;y+=step)for(let x=q.x;x<q.x+q.w;x+=step){const i=(y*d.width+x)*4,rr=arr[i],gg=arr[i+1],bb=arr[i+2],lum=.2126*rr+.7152*gg+.0722*bb,u=(x-q.x)/q.w,v=(y-q.y)/q.h;n++;R+=rr;G+=gg;B+=bb;Y+=lum;xx+=u;yy+=v;x2+=u*u;y2+=v*v;xy+=u*v;xY+=u*lum;yY+=v*lum;Y2+=lum*lum;}if(n<25)throw Error("The selection is too small. Select a larger region.");const mean=Y/n;const Sxx=x2-xx*xx/n,Syy=y2-yy*yy/n,Sxy=xy-xx*yy/n,SxY=xY-xx*Y/n,SyY=yY-yy*Y/n,det=Sxx*Syy-Sxy*Sxy;let a=0,b=0;if(Math.abs(det)>1e-9){a=(SxY*Syy-SyY*Sxy)/det;b=(SyY*Sxx-SxY*Sxy)/det;}const explained=a*SxY+b*SyY;const variance=Math.max(0,(Y2-Y*Y/n-explained)/n);return {r:R/n,g:G/n,b:B/n,y:mean,std:Math.sqrt(variance),n};}
function checkerPatches(){const r=state.rois.checker,arr=[];for(let row=0;row<4;row++){const line=[];for(let col=0;col<6;col++){const cx=r.x+r.w*(col+.5)/6,cy=r.y+r.h*(row+.5)/4;line.push(sample({x:cx-r.w*.035,y:cy-r.h*.045,w:r.w*.07,h:r.h*.09},2));}arr.push(line);}return arr;}
function rgbToXyz(s){const lin=v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4};const r=lin(s.r),g=lin(s.g),b=lin(s.b);return {X:.4124564*r+.3575761*g+.1804375*b,Y:.2126729*r+.7151522*g+.072175*b,Z:.0193339*r+.119192*g+.9503041*b};}
function rgbToLab(s){const xyz=rgbToXyz(s),x=xyz.X/.95047,y=xyz.Y,z=xyz.Z/1.08883;const f=v=>v>.008856?Math.cbrt(v):7.787*v+16/116;return {L:116*f(y)-16,a:500*(f(x)-f(y)),b:200*(f(y)-f(z))};}
function rgbToChromaticity(s){const {X,Y,Z}=rgbToXyz(s),sum=X+Y+Z;if(sum<=0)throw Error("The neutral sample is too dark to calculate chromaticity coordinates.");return{x:X/sum,y:Y/sum};}
function castDirection(lab){if(Math.hypot(lab.a,lab.b)<2)return "Near neutral";const directions=[];if(Math.abs(lab.a)>=2)directions.push(lab.a>0?"red":"green");if(Math.abs(lab.b)>=2)directions.push(lab.b>0?"yellow":"blue");return directions.length?`Cast toward ${directions.join(" and ")}`:"Near neutral";}
function neutralDelta(s){const lab=rgbToLab(s);return {delta:Math.hypot(lab.a,lab.b),lab};}
function calculateResolution(){
  const q=region(state.rois.resolution),d=pixels();
  if(q.w<30||q.h<30)throw Error("The slanted-edge region must be at least 30 × 30 pixels.");
  const lum=(x,y)=>{const i=(y*d.width+x)*4,a=d.data;return .2126*a[i]+.7152*a[i+1]+.0722*a[i+2]};
  let gx=0,gy=0;
  for(let y=q.y+2;y<q.y+q.h-2;y+=3)for(let x=q.x+2;x<q.x+q.w-2;x+=3){gx+=Math.abs(lum(x+1,y)-lum(x-1,y));gy+=Math.abs(lum(x,y+1)-lum(x,y-1));}
  const vertical=gx>=gy,edges=[];
  if(vertical){
    for(let y=q.y+2;y<q.y+q.h-2;y+=2){let best=0,pos=0;for(let x=q.x+3;x<q.x+q.w-3;x++){const v=Math.abs(lum(x+1,y)-lum(x-1,y));if(v>best){best=v;pos=x;}}if(best>18)edges.push({t:y,n:pos,strength:best});}
  }else{
    for(let x=q.x+2;x<q.x+q.w-2;x+=2){let best=0,pos=0;for(let y=q.y+3;y<q.y+q.h-3;y++){const v=Math.abs(lum(x,y+1)-lum(x,y-1));if(v>best){best=v;pos=y;}}if(best>18)edges.push({t:x,n:pos,strength:best});}
  }
  if(edges.length<20)throw Error("No sufficiently clear slanted edge was found. Select one black-to-white edge.");
  const fit=pts=>{const n=pts.length,mt=pts.reduce((s,p)=>s+p.t,0)/n,mn=pts.reduce((s,p)=>s+p.n,0)/n;let a=0,b=0;for(const p of pts){a+=(p.t-mt)*(p.n-mn);b+=(p.t-mt)**2;}a/=b||1;return{a,b:mn-a*mt}};
  let line=fit(edges);
  const residuals=edges.map(p=>Math.abs(p.n-(line.a*p.t+line.b))).sort((a,b)=>a-b),limit=Math.max(2,residuals[Math.floor(residuals.length*.6)]*2);
  const good=edges.filter(p=>Math.abs(p.n-(line.a*p.t+line.b))<=limit);
  if(good.length<20)throw Error("Slanted-edge detection is unstable. Tighten the selection.");
  line=fit(good);
  const bins=Array(128).fill(0),counts=Array(128).fill(0),center=64;
  for(let y=q.y;y<q.y+q.h;y++)for(let x=q.x;x<q.x+q.w;x++){
    const t=vertical?y:x,n=vertical?x:y,dist=(n-(line.a*t+line.b))/Math.sqrt(1+line.a**2),k=Math.round(dist*4)+center;
    if(k>=0&&k<128){bins[k]+=lum(x,y);counts[k]++;}
  }
  const esf=bins.map((v,i)=>counts[i]?v/counts[i]:NaN);
  for(let i=1;i<esf.length;i++)if(!Number.isFinite(esf[i]))esf[i]=esf[i-1];
  for(let i=esf.length-2;i>=0;i--)if(!Number.isFinite(esf[i]))esf[i]=esf[i+1];
  if(esf.some(v=>!Number.isFinite(v)))throw Error("Unable to generate the edge spread function.");
  const smooth=esf.map((_,i)=>(esf[Math.max(0,i-1)]+2*esf[i]+esf[Math.min(esf.length-1,i+1)])/4);
  const lsf=smooth.slice(1).map((v,i)=>v-smooth[i]);
  const N=lsf.length,windowed=lsf.map((v,i)=>v*(.5-.5*Math.cos(2*Math.PI*i/(N-1))));
  const dc=Math.abs(windowed.reduce((a,b)=>a+b,0));
  if(dc<10)throw Error("Insufficient edge contrast to estimate SFR.");
  const responseAt=frequency=>{
    let re=0,im=0;
    for(let i=0;i<N;i++){const angle=2*Math.PI*frequency*i/4;re+=windowed[i]*Math.cos(angle);im-=windowed[i]*Math.sin(angle);}
    return Math.hypot(re,im)/dc;
  };
  const curve=[{frequency:0,mtf:1}];
  for(let k=1;k<=Math.floor(N/4);k++){const frequency=4*k/N;curve.push({frequency,mtf:responseAt(frequency)});}
  curve.push({frequency:1,mtf:responseAt(1)});
  const crossing=level=>{
    for(let i=1;i<curve.length;i++){
      const a=curve[i-1],b=curve[i];
      if(a.mtf>level&&b.mtf<=level)return a.frequency+(b.frequency-a.frequency)*(level-a.mtf)/(b.mtf-a.mtf);
    }
    return null;
  };
  const mtf50=crossing(.5),mtf20=crossing(.2),mtf10=crossing(.1),nyquist=responseAt(.5);
  return {
    sfrMetrics:{mtf50,mtf20,mtf10,nyquist},imageHeight:d.height,
    method:"Slanted-edge ESF → windowed LSF → Fourier magnitude normalized at zero frequency. MTF50, MTF20, and MTF10 are the first 50%, 20%, and 10% crossings; Nyquist SFR is evaluated at 0.5 cycles/pixel. LW/PH = 2 × cycles/pixel × image height.",
    data:{mtf50CyclesPerPixel:mtf50,mtf20CyclesPerPixel:mtf20,mtf10CyclesPerPixel:mtf10,mtf50LwPerPictureHeight:mtf50===null?null:2*mtf50*d.height,mtf20LwPerPictureHeight:mtf20===null?null:2*mtf20*d.height,mtf10LwPerPictureHeight:mtf10===null?null:2*mtf10*d.height,sfrAtNyquist:nyquist,sfrAtNyquistPercent:nyquist*100,lwPerPictureHeight:mtf50===null?null:2*mtf50*d.height,sfrCurve:curve,edgeOrientation:vertical?"vertical":"horizontal",edgeSamples:good.length,roi:state.rois.resolution},
    note:"These values are estimates from a single ROI using the application's simplified slanted-edge implementation. Threshold crossings are searched only through 1.0 cycles/pixel; a missing crossing is reported as unavailable. Sharpening, noise, and edge selection affect the results."
  };
}
function resolutionDisplay(result){
  const frequencies=result.sfrMetrics,height=result.imageHeight;
  const resolutionText=value=>value===null?"Not reached ≤ 1.0 cy/px":`${fmt(2*value*height,0)} LW/PH`;
  const metrics=[["MTF50",resolutionText(frequencies.mtf50)],["MTF20",resolutionText(frequencies.mtf20)],["MTF10",resolutionText(frequencies.mtf10)],["SFR at Nyquist",`${fmt(frequencies.nyquist*100,1)} %`],["Edge orientation",result.data.edgeOrientation==="vertical"?"Nearly vertical":"Nearly horizontal"],["Valid edge profiles",String(result.data.edgeSamples)]];
  return{label:"Slanted-edge SFR",value:frequencies.mtf50===null?"—":fmt(2*frequencies.mtf50*height,0),unit:frequencies.mtf50===null?"":"LW/PH",detail:"MTF50 shown above; all four SFR metrics are listed below. Nyquist response is a modulation percentage.",metrics};
}
function calculateColor(){
  const measured=checkerPatches().flat();
  const patches=measured.map((s,i)=>{
    const reference=colorCheckerReference[i];
    const actual=[s.r,s.g,s.b];
    const m=rgbToLab(s),r=rgbToLab({r:reference[0],g:reference[1],b:reference[2]});
    return {number:i+1,measured:actual,reference,deltaE76:Math.hypot(m.L-r.L,m.a-r.a,m.b-r.b)};
  });
  const errors=patches.map(p=>p.deltaE76);
  const mean=errors.reduce((a,b)=>a+b,0)/patches.length;
  const worst=patches.reduce((a,b)=>b.deltaE76>a.deltaE76?b:a);
  const colorMean=errors.slice(0,18).reduce((a,b)=>a+b,0)/18;
  const grayMean=errors.slice(18).reduce((a,b)=>a+b,0)/6;
  return {label:"Mean color difference (24 patches)",value:fmt(mean,2),unit:"ΔE*ab",detail:"Compared with ColorChecker Classic sRGB reference values across 24 patches.",metrics:[["Chromatic patch mean",`${fmt(colorMean,2)} ΔE`],["Neutral patch mean",`${fmt(grayMean,2)} ΔE`],["Maximum color difference",`${fmt(worst.deltaE76,2)} · #${worst.number}`],["Patches measured","24 / 24"]],method:"Convert each patch's mean sRGB to CIELAB (D65); calculate CIE76 ΔE*ab against 24 reference values and average the results",patches,data:{meanDeltaE76:mean,colorPatchMeanDeltaE76:colorMean,grayPatchMeanDeltaE76:grayMean,patchDeltaE76:errors,measuredSRGB:patches.map(p=>p.measured),referenceSRGB:colorCheckerReference,referenceSource:"X-Rite ColorChecker Classic legacy sRGB D65",roi:state.rois.checker},note:"References use legacy ColorChecker Classic D65 sRGB values. Lighting, exposure, color profiles, chart batch, and selection placement affect the result. Do not use it as a formal calibration report."};
}
function calculateWhiteBalance(){const neutral=checkerPatches()[3].slice(1,5);const mean={r:neutral.reduce((s,v)=>s+v.r,0)/4,g:neutral.reduce((s,v)=>s+v.g,0)/4,b:neutral.reduce((s,v)=>s+v.b,0)/4};const imbalance=(Math.max(mean.r,mean.g,mean.b)-Math.min(mean.r,mean.g,mean.b))/((mean.r+mean.g+mean.b)/3)*100;const n=neutralDelta(mean),xy=rgbToChromaticity(mean),direction=castDirection(n.lab);return{label:"RGB imbalance",value:fmt(imbalance,2),unit:"%",detail:`Mean of the four middle neutral patches: ${direction}.`,metrics:[["Color cast direction",direction],["CIE 1931 xy",`${fmt(xy.x,4)}, ${fmt(xy.y,4)}`],["a* / b*",`${fmt(n.lab.a,1)} / ${fmt(n.lab.b,1)}`],["Neutral color difference",`${fmt(n.delta,2)} ΔE*ab`],["R / G",fmt(mean.r/mean.g,3)],["B / G",fmt(mean.b/mean.g,3)],["Patches used","Row 4, patches 2–5"]],chromaticity:xy,method:"Mean sRGB of four neutral patches → linear RGB → XYZ (D65) → CIE 1931 xy; positive a* indicates red and negative a* green; positive b* indicates yellow and negative b* blue; RGB imbalance = (max RGB − min RGB) ÷ mean RGB × 100%",data:{rgbImbalancePercent:imbalance,rgRatio:mean.r/mean.g,bgRatio:mean.b/mean.g,neutralDeltaE76:n.delta,labA:n.lab.a,labB:n.lab.b,castDirection:direction,cie1931xy:xy,referenceWhiteXY:{x:.3127,y:.3290},meanRGB:[mean.r,mean.g,mean.b],roi:state.rois.checker},note:"The xy value is estimated from image pixels assuming sRGB; it is not a direct measurement of illuminant chromaticity. Chart placement, exposure, color profiles, and camera processing affect the result."};}
function calculateGray(){
  const measured=checkerPatches()[3];
  const patches=measured.map((s,i)=>{
    const reference=colorCheckerReference[18+i];
    const measuredL=rgbToLab(s).L;
    const referenceL=rgbToLab({r:reference[0],g:reference[1],b:reference[2]}).L;
    return {number:i+1,measured:[s.r,s.g,s.b],reference,measuredL,referenceL,deltaL:measuredL-referenceL};
  });
  const l=patches.map(p=>p.measuredL),steps=l.slice(0,5).map((v,i)=>v-l[i+1]),mono=steps.filter(v=>v>0).length;
  return {label:"Resolved gray-scale steps",value:`${mono} / 5`,unit:"steps",detail:"Adjacent patches are considered correctly ordered when their lightness difference exceeds zero.",metrics:[["Lightness range",`${fmt(l[0],1)} → ${fmt(l[5],1)} L*`],["Minimum adjacent ΔL*",fmt(Math.min(...steps),1)],["Maximum adjacent ΔL*",fmt(Math.max(...steps),1)],["Gray-scale ordering",mono===5?"Strictly decreasing":"Order reversal detected"]],method:"Convert mean sRGB from the six bottom-row patches to CIELAB L*; per-patch ΔL* = measured L* − ColorChecker Classic reference L*; compare adjacent measured values",data:{labLightness:l,referenceLabLightness:patches.map(p=>p.referenceL),patchDeltaL:patches.map(p=>p.deltaL),measuredSRGB:patches.map(p=>p.measured),referenceSRGB:patches.map(p=>p.reference),referenceSource:"X-Rite ColorChecker Classic legacy sRGB D65",adjacentDeltaL:steps,correctOrderCount:mono,roi:state.rois.checker},grayPatches:patches,note:"Per-patch differences use legacy ColorChecker Classic D65 sRGB references. A positive value means the measured patch is lighter. Exposure, lighting, color profiles, chart batch, and selection placement affect the result; this is not a direct physical luminance error."};
}
function calculateSNR(){const p=checkerPatches()[3].slice(1,5),values=p.map(s=>20*Math.log10(s.y/Math.max(s.std,.01))),avg=values.reduce((a,b)=>a+b,0)/values.length;return{label:"Single-image spatial SNR",value:fmt(avg,1),unit:"dB",detail:"Estimated from the four middle neutral patches after removing a linear brightness gradient.",metrics:[["Brightest neutral patch SNR",`${fmt(values[0],1)} dB`],["Darkest neutral patch SNR",`${fmt(values[3],1)} dB`],["Mean brightness",fmt(p.reduce((a,b)=>a+b.y,0)/4,1)],["Neutral patches","4"]],method:"For each patch, Y = 0.2126R + 0.7152G + 0.0722B; remove the fitted brightness plane; SNR = 20 log10(mean Y / residual σ)",data:{spatialSnrDb:avg,patchSnrDb:values,roi:state.rois.checker},note:"This single-image spatial noise estimate includes texture, compression artifacts, and fixed-pattern noise. Temporal SNR requires multiple images captured under the same conditions."};}
function calculateUniformity(){const r=state.rois.uniformity,pts=[];for(const yy of [.14,.5,.86])for(const xx of [.14,.5,.86]){const cx=r.x+r.w*xx,cy=r.y+r.h*yy;pts.push(sample({x:cx-r.w*.035,y:cy-r.h*.035,w:r.w*.07,h:r.h*.07},3).y);}const center=pts[4],min=Math.min(...pts),max=Math.max(...pts),ratio=min/center*100,corners=[pts[0],pts[2],pts[6],pts[8]];return{label:"Minimum-to-center brightness",value:fmt(ratio,1),unit:"%",detail:"Minimum of nine sampled brightness values relative to the center.",metrics:[["Center brightness",fmt(center,1)],["Minimum / maximum",`${fmt(min,1)} / ${fmt(max,1)}`],["Corner mean / center",`${fmt(corners.reduce((a,b)=>a+b,0)/4/center*100,1)} %`],["Nine-point range",`${fmt((max-min)/center*100,1)} %`]],method:"Sample mean brightness at 3 × 3 positions within the selected white field; minimum ÷ center × 100%",data:{minimumToCenterPercent:ratio,centerLuminance:center,ninePointLuminance:pts,roi:r},uniformityPoints:pts,note:"Brightness is a weighted average of image RGB values (0–255), not absolute illuminance. Select only the uniform white field; uneven ambient lighting also affects the result."};}
function calculateDistortion(){
  const found=detectChessboard(pixels(),state.rois.distortion);
  state.corners=found;
  return {
    label:"Automatic grid-line curvature",value:fmt(found.percent,2),unit:"%",
    detail:"Mean of the median horizontal and vertical grid-line curvature values.",
    metrics:[["Detected corners",String(found.cornerCount)],["Valid horizontal / vertical lines",`${found.rows.length} / ${found.cols.length}`],["Horizontal curvature",`${fmt(found.horizontal,2)} %`],["Vertical curvature",`${fmt(found.vertical,2)} %`]],
    method:"Detect checkerboard corners → group by rows and columns → maximum perpendicular deviation per line ÷ endpoint chord length → average horizontal and vertical medians",
    data:{lineBowPercent:found.percent,horizontalPercent:found.horizontal,verticalPercent:found.vertical,maxLinePercent:found.max,cornerCount:found.cornerCount,rowCount:found.rows.length,columnCount:found.cols.length,roi:state.rois.distortion,points:found.points.map(p=>({x:p.x*found.scale,y:p.y*found.scale}))},
    note:"This automatic grid-line curvature is a proxy for distortion, not a lens-model-corrected distortion metric. Perspective, camera angle, irregular grid lines, and corner-detection errors affect the result."
  };
}
function analyze(){if(!state.img||!state.imageData){showError("Load an image before analysis.");return;}try{const id=current().id;const functions={resolution:calculateResolution,color:calculateColor,whiteBalance:calculateWhiteBalance,grayScale:calculateGray,snr:calculateSNR,uniformity:calculateUniformity,distortion:calculateDistortion};state.result=functions[id]();if(id==="distortion")draw();$("resultState").textContent="Analysis complete";$("resultState").className="state-pill done";$("statusText").textContent=`${current().name} Analysis complete`;$("exportButton").disabled=false;renderPanel();}catch(e){invalidateResult();draw();$("resultState").textContent="Adjustment required";$("resultState").className="state-pill error";$("statusText").textContent=e.message;renderPanel(e.message);}}
function renderColorComparison(patches){
  return `<div class="section-title">Per-patch color difference</div><div class="patch-help">Patches follow chart order from left to right and top to bottom. Color codes are sRGB; ΔE uses CIE76.</div><div class="patch-list" role="table" aria-label="24-patch measured versus reference comparison"><div class="patch-row patch-heading" role="row"><span>Patch</span><span>Measured</span><span>Reference</span><span>ΔE</span></div>${patches.map(p=>`<div class="patch-row" role="row"><span class="patch-number">${p.number}</span><span class="patch-color"><i class="patch-swatch" style="background:${rgbHex(p.measured)}"></i><code>${rgbHex(p.measured)}</code></span><span class="patch-color"><i class="patch-swatch" style="background:${rgbHex(p.reference)}"></i><code>${rgbHex(p.reference)}</code></span><strong>${fmt(p.deltaE76,2)}</strong></div>`).join("")}</div>`;
}
function renderGrayComparison(patches){
  return `<div class="section-title">Per-patch lightness difference</div><div class="patch-help">From left to right, values correspond to the six bottom-row patches. ΔL* = measured − reference; positive values are lighter.</div><div class="patch-list" role="table" aria-label="Six-patch measured versus reference lightness comparison"><div class="patch-row gray-patch-row patch-heading" role="row"><span>Patch</span><span>Measured L*</span><span>Reference L*</span><span>ΔL*</span></div>${patches.map(p=>`<div class="patch-row gray-patch-row" role="row"><span class="patch-number">${p.number}</span><span class="patch-color"><i class="patch-swatch" style="background:${rgbHex(p.measured)}"></i>${fmt(p.measuredL,1)}</span><span class="patch-color"><i class="patch-swatch" style="background:${rgbHex(p.reference)}"></i>${fmt(p.referenceL,1)}</span><strong>${p.deltaL>0?"+":""}${fmt(p.deltaL,1)}</strong></div>`).join("")}</div>`;
}
function renderUniformityPoints(points){
  const labels=["Top left","Top center","Top right","Middle left","Center","Middle right","Bottom left","Bottom center","Bottom right"];
  return `<div class="section-title">Nine-point brightness values</div><div class="patch-help">Positions correspond to the nine image sampling locations. Brightness is a weighted RGB average on a 0–255 scale.</div><div class="uniformity-grid" aria-label="Nine-point brightness values">${points.map((value,i)=>`<div class="uniformity-point"><small>${labels[i]}</small><strong>${fmt(value,1)}</strong></div>`).join("")}</div>`;
}
function renderChromaticity(xy){
  const white={x:.3127,y:.3290},pad=.025;
  const minX=Math.min(xy.x,white.x)-pad,maxX=Math.max(xy.x,white.x)+pad;
  const minY=Math.min(xy.y,white.y)-pad,maxY=Math.max(xy.y,white.y)+pad;
  const px=x=>40+(x-minX)/(maxX-minX)*220;
  const py=y=>185-(y-minY)/(maxY-minY)*165;
  const wx=px(white.x),wy=py(white.y),mx=px(xy.x),my=py(xy.y);
  return `<div class="section-title">CIE 1931 xy chromaticity coordinates</div><div class="xy-chart"><svg viewBox="0 0 280 218" role="img" aria-label="Measured point x ${fmt(xy.x,4)} y ${fmt(xy.y,4)}; D65 reference white point x 0.3127 y 0.3290"><rect x="40" y="20" width="220" height="165" rx="4" fill="#101c2b" stroke="#375164"/><line x1="${wx}" y1="20" x2="${wx}" y2="185" stroke="#567587" stroke-dasharray="3 4"/><line x1="40" y1="${wy}" x2="260" y2="${wy}" stroke="#567587" stroke-dasharray="3 4"/><line x1="${wx}" y1="${wy}" x2="${mx}" y2="${my}" stroke="#f0be78" stroke-width="2"/><circle cx="${wx}" cy="${wy}" r="5" fill="#f4f7fb" stroke="#101c2b" stroke-width="2"/><circle cx="${mx}" cy="${my}" r="7" fill="#f0be78" stroke="#101c2b" stroke-width="2"/><text x="40" y="205">${fmt(minX,3)}</text><text x="260" y="205" text-anchor="end">${fmt(maxX,3)} x</text><text x="34" y="24" text-anchor="end">y</text><text x="34" y="184" text-anchor="end">${fmt(minY,3)}</text></svg><div class="xy-legend"><span><i class="xy-dot measured"></i>Measured (${fmt(xy.x,4)}, ${fmt(xy.y,4)})</span><span><i class="xy-dot reference"></i>D65 (0.3127, 0.3290)</span></div></div>`;
}
function renderPanel(error=""){
  const t=current(),key=roiKey();
  const hints={resolution:"Drag to select one slanted edge on the ISO 12233 chart, excluding text and other lines.",checker:"Drag to select the complete 6 × 4 ColorChecker patch grid.",uniformity:"Drag to select the usable white-field area; the nine sample points follow the selection.",distortion:"Click Analyze to detect corners automatically. If needed, drag to select the checkerboard region."};
  $("interactionHint").textContent=hints[key];
  let html="";
  if(state.result){
    const r=state.result.sfrMetrics?{...state.result,...resolutionDisplay(state.result)}:state.result;
    html=`<div class="result-hero"><div class="label">${safe(r.label)}</div><div class="number">${safe(r.value)}<small>${safe(r.unit)}</small></div><div class="detail">${safe(r.detail)}</div></div><div class="section-title">Measurement data</div><div class="metric-grid">${r.metrics.map(m=>`<div class="metric"><small>${safe(m[0])}</small><strong>${safe(m[1])}</strong></div>`).join("")}</div>`;
    if(r.chromaticity)html+=renderChromaticity(r.chromaticity);
    if(r.patches)html+=renderColorComparison(r.patches);
    if(r.grayPatches)html+=renderGrayComparison(r.grayPatches);
    if(r.uniformityPoints)html+=renderUniformityPoints(r.uniformityPoints);
    if(r.swatches)html+=`<div class="section-title">Gray-scale samples</div><div class="swatch-row">${r.swatches.map(c=>`<div class="swatch" style="background:${c}"></div>`).join("")}</div><div class="swatch-row-label"><span>Lightest</span><span>Darkest</span></div>`;
    html+=`<div class="section-title">Calculation method</div><div class="instructions">${safe(r.method)}</div><div class="caution">${safe(r.note)}</div>`;
  }else{
    html=`<div class="empty-state"><div class="empty-icon">◎</div>${error?`<span class="error-text">${safe(error)}</span>`:"Select a test region, then click Analyze to view the results."}</div><div class="section-title">Instructions</div><div class="instructions">${safe(hints[key])}</div>`;
    html+=`<div class="section-title">Measurement overview</div><div class="instructions">${safe(({resolution:"Show MTF50, MTF20, and MTF10 in LW/PH together with SFR at Nyquist as a modulation percentage.",color:"Compare all 24 ColorChecker patches with reference values and average their color differences.",whiteBalance:"Analyze RGB differences in the four middle neutral patches of the bottom row.",grayScale:"Check whether the six bottom-row neutral patches decrease in lightness and show each difference from its reference.",snr:"Estimate SNR from the detrended spatial standard deviation of neutral patches.",uniformity:"Measure brightness at nine white-field positions and compare each with the center.",distortion:"Automatically detect checkerboard corners and calculate horizontal and vertical grid-line curvature."})[t.id])}</div>`;
  }
  $("resultContent").innerHTML=html;
}
selectTest(0);
