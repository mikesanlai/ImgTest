"use strict";

// Detect saddle-like checkerboard intersections from four quadrant averages.
// Work on a reduced grayscale image so the analysis stays responsive in a browser.
function detectChessboard(imageData, roi) {
  const iw=imageData.width,ih=imageData.height,stride=Math.max(1,Math.ceil(Math.max(iw/960,ih/640)));
  const w=Math.ceil(iw/stride),h=Math.ceil(ih/stride),gray=new Float32Array(w*h),src=imageData.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const ix=Math.min(iw-1,x*stride),iy=Math.min(ih-1,y*stride),k=(iy*iw+ix)*4;
    gray[y*w+x]=.2126*src[k]+.7152*src[k+1]+.0722*src[k+2];
  }
  const integral=new Float64Array((w+1)*(h+1));
  for(let y=0;y<h;y++){
    let row=0;
    for(let x=0;x<w;x++){row+=gray[y*w+x];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+row;}
  }
  const box=(x0,y0,x1,y1)=>integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0];
  const radius=Math.max(5,Math.round(Math.min(w,h)/78)),area=radius*radius;
  const x0=Math.max(radius,Math.floor(roi.x*w)),x1=Math.min(w-radius,Math.ceil((roi.x+roi.w)*w));
  const y0=Math.max(radius,Math.floor(roi.y*h)),y1=Math.min(h-radius,Math.ceil((roi.y+roi.h)*h));
  const candidates=[];
  for(let y=y0;y<y1;y+=2)for(let x=x0;x<x1;x+=2){
    const a=box(x-radius,y-radius,x,y),b=box(x,y-radius,x+radius,y);
    const c=box(x-radius,y,x,y+radius),d=box(x,y,x+radius,y+radius);
    const contrast=Math.abs(a+d-b-c)/(2*area);
    const asymmetry=(Math.abs(a-d)+Math.abs(b-c))/(2*area);
    const score=contrast-.35*asymmetry;
    if(score>28)candidates.push({x,y,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  const minDistance=Math.max(13,radius*2),gridSize=minDistance,occupied=new Map(),points=[];
  const cell=(x,y)=>`${x},${y}`;
  for(const p of candidates){
    const gx=Math.floor(p.x/gridSize),gy=Math.floor(p.y/gridSize);
    let close=false;
    for(let dy=-1;dy<=1&&!close;dy++)for(let dx=-1;dx<=1;dx++){
      const bucket=occupied.get(cell(gx+dx,gy+dy));
      if(bucket?.some(q=>(p.x-q.x)**2+(p.y-q.y)**2<minDistance**2)){close=true;break;}
    }
    if(close)continue;
    points.push(p);
    const k=cell(gx,gy);if(!occupied.has(k))occupied.set(k,[]);occupied.get(k).push(p);
  }
  if(points.length<45)throw Error("Too few checkerboard corners were detected. Use a sharper image and select the checkerboard region.");
  const group=(axis,tolerance,minCount)=>{
    const groups=[];
    for(const p of [...points].sort((a,b)=>a[axis]-b[axis])){
      let nearest=null,distance=Infinity;
      for(const g of groups){const d=Math.abs(p[axis]-g.center);if(d<distance){distance=d;nearest=g;}}
      if(distance<=tolerance){nearest.points.push(p);nearest.center+=(p[axis]-nearest.center)/nearest.points.length;}
      else groups.push({center:p[axis],points:[p]});
    }
    return groups.filter(g=>g.points.length>=minCount).sort((a,b)=>a.center-b.center);
  };
  const rowGroups=group("y",Math.max(13,radius*2.2),8);
  const colGroups=group("x",Math.max(13,radius*2.2),5);
  if(rowGroups.length<4||colGroups.length<6)throw Error("Detected corners do not form enough grid lines. Tighten the selection around the checkerboard or use a sharper image.");
  const bow=(line,axis)=>{
    const sorted=[...line].sort((a,b)=>a[axis]-b[axis]);
    const a=sorted[0],b=sorted[sorted.length-1],length=Math.hypot(b.x-a.x,b.y-a.y);
    if(length<Math.min(w,h)*.18)return null;
    const deviations=sorted.slice(1,-1).map(p=>Math.abs((b.x-a.x)*(p.y-a.y)-(b.y-a.y)*(p.x-a.x))/length);
    return {percent:Math.max(...deviations)/length*100,points:sorted};
  };
  const rows=rowGroups.map(g=>bow(g.points,"x")).filter(Boolean);
  const cols=colGroups.map(g=>bow(g.points,"y")).filter(Boolean);
  if(rows.length<4||cols.length<6)throw Error("Too few valid grid lines to estimate distortion. Adjust the checkerboard selection.");
  const median=values=>{const s=[...values].sort((a,b)=>a-b);return(s[Math.floor((s.length-1)/2)]+s[Math.floor(s.length/2)])/2;};
  const horizontal=median(rows.map(v=>v.percent)),vertical=median(cols.map(v=>v.percent));
  const valid=new Set([...rows,...cols].flatMap(line=>line.points));
  return {percent:(horizontal+vertical)/2,horizontal,vertical,max:Math.max(...rows.map(v=>v.percent),...cols.map(v=>v.percent)),cornerCount:valid.size,rows,cols,points:[...valid],scale:stride};
}
