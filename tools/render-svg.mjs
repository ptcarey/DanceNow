// Minimal SVG rasterizer for our rig characters (no deps; Node zlib).
// Handles the element subset our avatars use: rect, circle, ellipse, line
// (round-cap stroke), and path (M/L/Q/Z, fill + stroke). Renders to PNG.
//   node tools/render-svg.mjs girl.svg girl-render.png

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";

const SCALE = 1.6, VW = 400, VH = 700;
const W = Math.round(VW * SCALE), H = Math.round(VH * SCALE), SS = 3;
const buf = new Float64Array(W * H * 3);

const file = process.argv[2], out = process.argv[3];
const svg = readFileSync(file, "utf8");

/* ---------- helpers ---------- */
function hex(c) {
  if (!c || c === "none") return null;
  let s = c.trim().replace("#", "");
  if (s.length === 3) s = s.split("").map((x) => x + x).join("");
  return [parseInt(s.slice(0,2),16), parseInt(s.slice(2,4),16), parseInt(s.slice(4,6),16)];
}
function bgFill(c){ for(let i=0;i<W*H;i++){ buf[i*3]=c[0]; buf[i*3+1]=c[1]; buf[i*3+2]=c[2]; } }
function blend(x,y,c,a){ if(x<0||y<0||x>=W||y>=H||a<=0)return; const i=(y*W+x)*3; buf[i]=buf[i]*(1-a)+c[0]*a; buf[i+1]=buf[i+1]*(1-a)+c[1]*a; buf[i+2]=buf[i+2]*(1-a)+c[2]*a; }
function paint(x0,y0,x1,y1,inside,color,alpha){
  x0=Math.max(0,Math.floor(x0)); y0=Math.max(0,Math.floor(y0)); x1=Math.min(W,Math.ceil(x1)); y1=Math.min(H,Math.ceil(y1));
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ let cov=0; for(let sy=0;sy<SS;sy++)for(let sx=0;sx<SS;sx++){ if(inside((x+(sx+0.5)/SS)/SCALE,(y+(sy+0.5)/SS)/SCALE)) cov++; } cov/=SS*SS; if(cov>0) blend(x,y,color,cov*alpha); }
}
function distSeg(px,py,a,b){ const vx=b[0]-a[0],vy=b[1]-a[1],wx=px-a[0],wy=py-a[1]; const c1=vx*wx+vy*wy; if(c1<=0)return Math.hypot(px-a[0],py-a[1]); const c2=vx*vx+vy*vy; if(c2<=c1)return Math.hypot(px-b[0],py-b[1]); const t=c1/c2; return Math.hypot(px-(a[0]+t*vx),py-(a[1]+t*vy)); }
const S=(v)=>v*SCALE;
function capsule(a,b,r,color,alpha){ paint(S(Math.min(a[0],b[0])-r),S(Math.min(a[1],b[1])-r),S(Math.max(a[0],b[0])+r),S(Math.max(a[1],b[1])+r),(x,y)=>distSeg(x,y,a,b)<=r,color,alpha); }
function discFill(c,r,color,alpha){ paint(S(c[0]-r),S(c[1]-r),S(c[0]+r),S(c[1]+r),(x,y)=>Math.hypot(x-c[0],y-c[1])<=r,color,alpha); }
function ring(c,r,sw,color,alpha){ paint(S(c[0]-r-sw),S(c[1]-r-sw),S(c[0]+r+sw),S(c[1]+r+sw),(x,y)=>Math.abs(Math.hypot(x-c[0],y-c[1])-r)<=sw/2,color,alpha); }
function ellipseFill(c,rx,ry,color,alpha){ paint(S(c[0]-rx),S(c[1]-ry),S(c[0]+rx),S(c[1]+ry),(x,y)=>((x-c[0])**2)/(rx*rx)+((y-c[1])**2)/(ry*ry)<=1,color,alpha); }
function ellipseRing(c,rx,ry,sw,color,alpha){ paint(S(c[0]-rx-sw),S(c[1]-ry-sw),S(c[0]+rx+sw),S(c[1]+ry+sw),(x,y)=>{const d=((x-c[0])**2)/(rx*rx)+((y-c[1])**2)/(ry*ry); return d<=1.18&&d>=0.84;},color,alpha); }
function polyFill(pts,color,alpha){ let x0=1e9,y0=1e9,x1=-1e9,y1=-1e9; for(const p of pts){x0=Math.min(x0,p[0]);y0=Math.min(y0,p[1]);x1=Math.max(x1,p[0]);y1=Math.max(y1,p[1]);} paint(S(x0),S(y0),S(x1),S(y1),(x,y)=>{let inside=false; for(let i=0,j=pts.length-1;i<pts.length;j=i++){const xi=pts[i][0],yi=pts[i][1],xj=pts[j][0],yj=pts[j][1]; if((yi>y)!==(yj>y)&&x<((xj-xi)*(y-yi))/(yj-yi)+xi)inside=!inside;} return inside;},color,alpha); }
function polyStroke(pts,sw,color,alpha,closed){ const r=sw/2; for(let i=0;i<pts.length-1;i++)capsule(pts[i],pts[i+1],r,color,alpha); if(closed&&pts.length>1)capsule(pts[pts.length-1],pts[0],r,color,alpha); }

/* ---------- path parsing (M/L/Q/Z, absolute) ---------- */
function parsePath(d){
  const tk=d.match(/([MLQZHVmlqzhv])|(-?\d*\.?\d+(?:e-?\d+)?)/g)||[];
  let i=0,cmd=null,cur=[0,0],start=[0,0],subs=[],sub=null;
  const num=()=>parseFloat(tk[i++]);
  const flatQ=(p0,c,p1)=>{ const N=14; for(let t=1;t<=N;t++){const u=t/N,m=1-u; sub.points.push([m*m*p0[0]+2*m*u*c[0]+u*u*p1[0], m*m*p0[1]+2*m*u*c[1]+u*u*p1[1]]);} };
  while(i<tk.length){
    if(/[A-Za-z]/.test(tk[i])){ cmd=tk[i].toUpperCase(); i++; }
    if(cmd==="M"){ const x=num(),y=num(); cur=[x,y]; start=cur; sub={points:[cur],closed:false}; subs.push(sub); cmd="L"; }
    else if(cmd==="L"){ const x=num(),y=num(); cur=[x,y]; sub.points.push(cur); }
    else if(cmd==="H"){ const x=num(); cur=[x,cur[1]]; sub.points.push(cur); }
    else if(cmd==="V"){ const y=num(); cur=[cur[0],y]; sub.points.push(cur); }
    else if(cmd==="Q"){ const cx=num(),cy=num(),x=num(),y=num(); flatQ(cur,[cx,cy],[x,y]); cur=[x,y]; }
    else if(cmd==="Z"){ if(sub){sub.closed=true; sub.points.push(start);} cur=start; }
    else { i++; }
  }
  return subs;
}

/* ---------- attribute reader ---------- */
const attr=(s,n)=>{ const m=s.match(new RegExp(n+'="([^"]*)"')); return m?m[1]:null; };
const fnum=(s,n,d=0)=>{ const v=attr(s,n); return v==null?d:parseFloat(v); };

/* ---------- render in document order ---------- */
bgFill([235, 240, 250]);
const elems=svg.match(/<(rect|circle|ellipse|line|path)\b[^>]*?\/?>/g)||[];
for(const e of elems){
  const tag=e.match(/<(\w+)/)[1];
  const fill=hex(attr(e,"fill")), stroke=hex(attr(e,"stroke")), sw=fnum(e,"stroke-width",1), op=fnum(e,"opacity",1);
  if(op<=0) continue;
  if(tag==="rect"){ const x=fnum(e,"x"),y=fnum(e,"y"),w=fnum(e,"width"),h=fnum(e,"height"); const pts=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]]; if(fill)polyFill(pts,fill,op); if(stroke)polyStroke(pts,sw,stroke,op,true); }
  else if(tag==="line"){ const a=[fnum(e,"x1"),fnum(e,"y1")],b=[fnum(e,"x2"),fnum(e,"y2")]; if(stroke)capsule(a,b,sw/2,stroke,op); }
  else if(tag==="circle"){ const c=[fnum(e,"cx"),fnum(e,"cy")],r=fnum(e,"r"); if(fill)discFill(c,r,fill,op); if(stroke)ring(c,r,sw,stroke,op); }
  else if(tag==="ellipse"){ const c=[fnum(e,"cx"),fnum(e,"cy")],rx=fnum(e,"rx"),ry=fnum(e,"ry"); if(fill)ellipseFill(c,rx,ry,fill,op); if(stroke)ellipseRing(c,rx,ry,sw,stroke,op); }
  else if(tag==="path"){ const subs=parsePath(attr(e,"d")||""); if(fill)for(const s of subs)polyFill(s.points,fill,op); if(stroke)for(const s of subs)polyStroke(s.points,sw,stroke,op,s.closed); }
}

/* ---------- encode PNG ---------- */
const rgba=Buffer.alloc(W*H*4);
for(let i=0;i<W*H;i++){ rgba[i*4]=Math.round(buf[i*3]); rgba[i*4+1]=Math.round(buf[i*3+1]); rgba[i*4+2]=Math.round(buf[i*3+2]); rgba[i*4+3]=255; }
const crc=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return(b)=>{let c=0xffffffff;for(let i=0;i<b.length;i++)c=t[(c^b[i])&0xff]^(c>>>8);return(c^0xffffffff)>>>0;};})();
const chunk=(ty,da)=>{const l=Buffer.alloc(4);l.writeUInt32BE(da.length,0);const b=Buffer.concat([Buffer.from(ty),da]);const c=Buffer.alloc(4);c.writeUInt32BE(crc(b),0);return Buffer.concat([l,b,c]);};
const ih=Buffer.alloc(13);ih.writeUInt32BE(W,0);ih.writeUInt32BE(H,4);ih[8]=8;ih[9]=6;
const st=W*4,raw=Buffer.alloc((st+1)*H);for(let y=0;y<H;y++){raw[y*(st+1)]=0;rgba.copy(raw,y*(st+1)+1,y*st,y*st+st);}
writeFileSync(out,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk("IHDR",ih),chunk("IDAT",deflateSync(raw,{level:9})),chunk("IEND",Buffer.alloc(0))]));
console.log("wrote",out,W+"x"+H);
