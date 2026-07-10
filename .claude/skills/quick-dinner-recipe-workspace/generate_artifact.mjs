// Builds a self-contained review HTML for iteration-1 (Python-free substitute for generate_review.py).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

const ITER = process.argv[2] || "iteration-1";
const ITERNUM = (ITER.match(/(\d+)/) || [, "1"])[1];
const evals = [
  { id: 0, name: "generic-quick-dinner", prompt: "오늘 저녁 뭐 해먹지? 15분 안에 되는 거 하나 추천해줘" },
  { id: 1, name: "with-ingredients", prompt: "냉장고에 계란이랑 김치, 찬밥 있는데 이걸로 후딱 저녁 만들어줘" },
  { id: 2, name: "specific-ingredient", prompt: "참치캔 하나 있는데 이걸로 간단한 저녁 한 그릇 만들어줄래? 설거지 적게 나오는 걸로" },
];

import { readdirSync } from "node:fs";
function run(evalId, cond) {
  const base = join(ITER, `eval-${evalId}`, cond);
  const outDir = join(base, "outputs");
  let md = null, file = null, img = null;
  if (existsSync(outDir)) {
    const mdFile = readdirSync(outDir).find(f => f.toLowerCase().endsWith(".md"));
    if (mdFile) { file = mdFile; md = readFileSync(join(outDir, mdFile), "utf8"); }
    const m = md && md.match(/!\[[^\]]*\]\((\.\/thumbnails\/[^)]+\.png)\)/);
    if (m) {
      const p = join(outDir, m[1].replace(/^\.\//, ""));
      if (existsSync(p)) img = "data:image/png;base64," + readFileSync(p).toString("base64");
    }
  }
  let grades = null;
  const gp = join(base, "grading.json");
  if (existsSync(gp)) grades = JSON.parse(readFileSync(gp, "utf8")).expectations;
  let timing = null;
  const tp = join(base, "timing.json");
  if (existsSync(tp)) timing = JSON.parse(readFileSync(tp, "utf8"));
  return { file, md, img, grades, timing };
}

const data = evals.map(e => ({
  ...e,
  with_skill: run(e.id, "with_skill"),
  without_skill: run(e.id, "without_skill"),
}));
const benchmark = JSON.parse(readFileSync(join(ITER, "benchmark.json"), "utf8"));

const payload = JSON.stringify({ data, benchmark, iterNum: ITERNUM }).replace(/</g, "\\u003c");

const html = `<div id="app"></div>
<style>
  :root{
    --paper:#FBFAF7; --raise:#FFFFFF; --ink:#201E1B; --muted:#6E685E; --faint:#948D80;
    --line:#E7E1D6; --line2:#D8D1C4; --accent:#C74A32; --good:#2F7D4E; --good-bg:#E9F3EC;
    --warn:#A65A1B; --warn-bg:#F6ECDD; --chip:#F2EEE7;
    --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Malgun Gothic","Apple SD Gothic Neo",sans-serif;
  }
  @media (prefers-color-scheme:dark){
    :root{ --paper:#171614; --raise:#201E1B; --ink:#ECE8E1; --muted:#A29B8E; --faint:#7C766B;
      --line:#332F29; --line2:#403A32; --accent:#E27A4D; --good:#6FBF80; --good-bg:#1D2A21;
      --warn:#E0A64A; --warn-bg:#2C2519; --chip:#26231F; }
  }
  :root[data-theme="light"]{ --paper:#FBFAF7; --raise:#FFFFFF; --ink:#201E1B; --muted:#6E685E; --faint:#948D80;
    --line:#E7E1D6; --line2:#D8D1C4; --accent:#C74A32; --good:#2F7D4E; --good-bg:#E9F3EC;
    --warn:#A65A1B; --warn-bg:#F6ECDD; --chip:#F2EEE7; }
  :root[data-theme="dark"]{ --paper:#171614; --raise:#201E1B; --ink:#ECE8E1; --muted:#A29B8E; --faint:#7C766B;
    --line:#332F29; --line2:#403A32; --accent:#E27A4D; --good:#6FBF80; --good-bg:#1D2A21;
    --warn:#E0A64A; --warn-bg:#2C2519; --chip:#26231F; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--sans);line-height:1.55;
    -webkit-font-smoothing:antialiased}
  .wrap{max-width:1080px;margin:0 auto;padding:32px 24px 80px}
  header.top{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:24px}
  .kicker{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);font-weight:700}
  h1{font-size:26px;margin:8px 0 6px;letter-spacing:-.01em;text-wrap:balance}
  .sub{color:var(--muted);font-size:14.5px;max-width:70ch}
  .fixbar{margin-top:14px;background:var(--good-bg);border:1px solid color-mix(in srgb,var(--good) 40%,var(--line));
    color:var(--ink);border-radius:10px;padding:11px 14px;font-size:13.5px}
  .fixbar b{color:var(--good)}
  .tabs{display:flex;gap:4px;margin:22px 0 26px;border-bottom:1px solid var(--line)}
  .tab{appearance:none;border:0;background:none;font:inherit;font-weight:600;font-size:14px;color:var(--muted);
    padding:10px 16px;cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
  .tab[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--accent)}
  .tab:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:4px}
  .pills{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:22px}
  .pill{appearance:none;border:1px solid var(--line2);background:var(--raise);font:inherit;font-size:13px;
    color:var(--muted);padding:7px 13px;border-radius:999px;cursor:pointer}
  .pill[aria-selected="true"]{background:var(--ink);color:var(--paper);border-color:var(--ink)}
  .pill:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
  .prompt{background:var(--chip);border:1px solid var(--line);border-radius:10px;padding:13px 16px;
    margin-bottom:22px;font-size:14.5px}
  .prompt b{color:var(--faint);font-weight:700;font-size:11.5px;letter-spacing:.1em;text-transform:uppercase;
    display:block;margin-bottom:4px}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  @media (max-width:760px){.cols{grid-template-columns:1fr}}
  .card{background:var(--raise);border:1px solid var(--line);border-radius:12px;overflow:hidden;display:flex;flex-direction:column}
  .card.win{border-color:color-mix(in srgb,var(--good) 45%,var(--line))}
  .card-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 15px;
    border-bottom:1px solid var(--line);background:color-mix(in srgb,var(--raise) 90%,var(--paper))}
  .tag{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:6px}
  .tag.skill{color:var(--good);background:var(--good-bg)}
  .tag.base{color:var(--warn);background:var(--warn-bg)}
  .score{font-size:12.5px;font-weight:700;font-variant-numeric:tabular-nums;color:var(--muted)}
  .card-b{padding:16px 16px 6px}
  .fname{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;color:var(--faint);
    margin-bottom:12px;word-break:break-all}
  .fname.bad{color:var(--warn)}
  .md img{max-width:100%;border-radius:10px;display:block;margin:0 0 14px;border:1px solid var(--line)}
  .md h1{font-size:19px;margin:2px 0 10px}
  .md h2{font-size:14px;margin:16px 0 7px;letter-spacing:.02em}
  .md blockquote{margin:0 0 12px;padding:8px 12px;background:var(--chip);border-radius:8px;font-size:13px;color:var(--muted)}
  .md ul,.md ol{margin:0 0 12px;padding-left:20px}.md li{margin:3px 0;font-size:13.5px}
  .md hr{border:0;border-top:1px solid var(--line);margin:14px 0}
  .noimg{border:1px dashed var(--line2);border-radius:10px;padding:22px;text-align:center;color:var(--faint);
    font-size:13px;margin-bottom:14px;background:color-mix(in srgb,var(--warn-bg) 40%,var(--raise))}
  details.grades{border-top:1px solid var(--line);margin-top:6px}
  details.grades summary{cursor:pointer;padding:11px 15px;font-size:12.5px;font-weight:600;color:var(--muted);list-style:none}
  details.grades summary::-webkit-details-marker{display:none}
  details.grades summary::before{content:"▸ ";color:var(--faint)}
  details.grades[open] summary::before{content:"▾ "}
  .glist{padding:0 15px 14px;display:flex;flex-direction:column;gap:6px}
  .grow{display:flex;gap:9px;font-size:12.5px;align-items:baseline}
  .gmark{flex:none;font-weight:800;width:15px}
  .gmark.ok{color:var(--good)} .gmark.no{color:var(--warn)}
  .gtext{color:var(--ink)} .gev{color:var(--faint);font-size:11.5px;display:block;margin-top:1px}
  table.bm{width:100%;border-collapse:collapse;font-size:13.5px;margin:6px 0 26px}
  table.bm th,table.bm td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
  table.bm th{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:700}
  table.bm td.num{text-align:right;font-variant-numeric:tabular-nums}
  .rowlabel .tag{display:inline-block}
  .delta{color:var(--good);font-weight:700}
  .notes{background:var(--raise);border:1px solid var(--line);border-radius:12px;padding:6px 4px}
  .notes li{margin:10px 16px;font-size:13.5px;color:var(--ink)}
  h2.sec{font-size:13px;letter-spacing:.1em;text-transform:uppercase;color:var(--faint);margin:6px 0 12px}
  .hide{display:none}
</style>
<script>
const PAYLOAD = ${payload};
const {data, benchmark, iterNum} = PAYLOAD;
const esc = s => s.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

function mdToHtml(md, imgUri){
  if(!md) return '';
  const lines = md.replace(/\\r/g,'').split('\\n');
  let out=[], list=null;
  const closeList=()=>{ if(list){ out.push('</'+list+'>'); list=null; } };
  const inline = s => esc(s)
    .replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>')
    .replace(/\`([^\`]+)\`/g,'<code>$1</code>');
  for(let raw of lines){
    const line = raw.replace(/\\s+$/,'');
    let m;
    if(m=line.match(/^!\\[[^\\]]*\\]\\((.+?)\\)\\s*$/)){ closeList();
      out.push(imgUri?'<img alt="thumbnail" src="'+imgUri+'">':''); continue; }
    if(/^\\s*$/.test(line)){ closeList(); continue; }
    if(m=line.match(/^#\\s+(.*)/)){ closeList(); out.push('<h1>'+inline(m[1])+'</h1>'); continue; }
    if(m=line.match(/^##\\s+(.*)/)){ closeList(); out.push('<h2>'+inline(m[1])+'</h2>'); continue; }
    if(m=line.match(/^###\\s+(.*)/)){ closeList(); out.push('<h2>'+inline(m[1])+'</h2>'); continue; }
    if(m=line.match(/^>\\s?(.*)/)){ closeList(); out.push('<blockquote>'+inline(m[1])+'</blockquote>'); continue; }
    if(/^---+\\s*$/.test(line)){ closeList(); out.push('<hr>'); continue; }
    if(m=line.match(/^\\s*[-*]\\s+(.*)/)){ if(list!=='ul'){closeList();list='ul';out.push('<ul>');}
      out.push('<li>'+inline(m[1])+'</li>'); continue; }
    if(m=line.match(/^\\s*\\d+\\.\\s+(.*)/)){ if(list!=='ol'){closeList();list='ol';out.push('<ol>');}
      out.push('<li>'+inline(m[1])+'</li>'); continue; }
    closeList(); out.push('<p>'+inline(line)+'</p>');
  }
  closeList();
  return out.join('\\n');
}

function scoreOf(g){ if(!g) return '—'; const p=g.filter(e=>e.passed===true).length; return p+'/'+g.length; }
function gradesHtml(g){ if(!g) return '';
  return '<details class="grades"><summary>채점 '+scoreOf(g)+'</summary><div class="glist">'+
    g.map(e=>'<div class="grow"><span class="gmark '+(e.passed?'ok':'no')+'">'+(e.passed?'✓':'✕')+
    '</span><span class="gtext">'+esc(e.text)+(e.evidence?'<span class="gev">'+esc(e.evidence)+'</span>':'')+
    '</span></div>').join('')+'</div></details>';
}
function runCard(r, kind){
  const isSkill = kind==='skill';
  const badName = r.file && !/^[a-z0-9]+(-[a-z0-9]+)*\\.md$/.test(r.file);
  let body='';
  if(!r.md){ body='<div class="card-b"><div class="noimg">출력 없음</div></div>'; }
  else{
    const img = isSkill ? '' : (r.img?'':'<div class="noimg">🚫 썸네일 없음<br><span style="font-size:11.5px">baseline은 이미지를 생성하지 않음</span></div>');
    body='<div class="card-b"><div class="fname'+(badName?' bad':'')+'">'+esc(r.file||'')+
      (badName?'  ⚠︎ 한글/규칙 위반 파일명':'')+'</div>'+img+
      '<div class="md">'+mdToHtml(r.md, isSkill?r.img:null)+'</div></div>';
  }
  return '<div class="card '+(isSkill?'win':'')+'"><div class="card-h"><span class="tag '+(isSkill?'skill':'base')+'">'+
    (isSkill?'스킬 사용':'baseline (스킬 없음)')+'</span><span class="score">'+scoreOf(r.grades)+'</span></div>'+
    body+gradesHtml(r.grades)+'</div>';
}

let curEval=0, curTab='outputs';
function render(){
  const app=document.getElementById('app');
  app.innerHTML='<div class="wrap">'+
   '<header class="top"><div class="kicker">Skill Eval · Iteration '+iterNum+'</div>'+
   '<h1>quick-dinner-recipe — 결과 리뷰</h1>'+
   '<div class="sub">15분 저녁 레시피 + fal.ai 썸네일 스킬. 각 테스트를 <b>스킬 사용</b>과 <b>baseline(스킬 없음)</b>으로 나란히 비교합니다. 우측 상단 숫자는 자동 채점 통과 수입니다.</div>'+
   (iterNum==='2'?'<div class="fixbar">✓ iteration-2 수정: <b>FAL_KEY 레지스트리 폴백</b> 추가 → 3/3 모두 썸네일을 <b>첫 시도에 자동 생성</b>(수동 개입 0), 실행 오버헤드 +31s→+11s.</div>':'')+
   '</header>'+
   '<div class="tabs" role="tablist">'+
     '<button class="tab" role="tab" aria-selected="'+(curTab==='outputs')+'" onclick="setTab(\\'outputs\\')">결과물</button>'+
     '<button class="tab" role="tab" aria-selected="'+(curTab==='bench')+'" onclick="setTab(\\'bench\\')">벤치마크</button>'+
   '</div>'+
   (curTab==='outputs'?outputsView():benchView())+
   '</div>';
}
function outputsView(){
  const pills=data.map((d,i)=>'<button class="pill" role="tab" aria-selected="'+(i===curEval)+
    '" onclick="setEval('+i+')">eval-'+d.id+' · '+esc(d.name)+'</button>').join('');
  const d=data[curEval];
  return '<div class="pills">'+pills+'</div>'+
    '<div class="prompt"><b>사용자 요청</b>'+esc(d.prompt)+'</div>'+
    '<div class="cols">'+runCard(d.with_skill,'skill')+runCard(d.without_skill,'base')+'</div>';
}
function benchView(){
  const s=benchmark.run_summary;
  const row=(label,tag,o)=>'<tr><td class="rowlabel"><span class="tag '+tag+'">'+label+'</span></td>'+
    '<td class="num">'+(o.pass_rate.mean*100).toFixed(0)+'%</td>'+
    '<td class="num">'+o.time_seconds.mean.toFixed(1)+'s</td>'+
    '<td class="num">'+o.tokens.mean.toLocaleString()+'</td></tr>';
  let perEval='';
  for(const d of data){
    perEval+='<tr><td>eval-'+d.id+' · '+esc(d.name)+'</td>'+
      '<td class="num">'+scoreOf(d.with_skill.grades)+'</td>'+
      '<td class="num">'+scoreOf(d.without_skill.grades)+'</td>'+
      '<td class="num">'+(d.with_skill.timing?d.with_skill.timing.total_duration_seconds+'s':'—')+'</td>'+
      '<td class="num">'+(d.without_skill.timing?d.without_skill.timing.total_duration_seconds+'s':'—')+'</td></tr>';
  }
  return '<h2 class="sec">요약 (구성별 평균)</h2>'+
   '<table class="bm"><thead><tr><th>구성</th><th class="num">통과율</th><th class="num">시간</th><th class="num">토큰</th></tr></thead>'+
   '<tbody>'+row('스킬 사용','skill',s.with_skill)+row('baseline','base',s.without_skill)+
   '<tr><td class="rowlabel" style="color:var(--muted);font-weight:700">차이 (Δ)</td>'+
   '<td class="num delta">'+s.delta.pass_rate+'</td><td class="num" style="color:var(--muted)">'+s.delta.time_seconds+'s</td>'+
   '<td class="num" style="color:var(--muted)">'+s.delta.tokens+'</td></tr></tbody></table>'+
   '<h2 class="sec">테스트별 통과 수</h2>'+
   '<table class="bm"><thead><tr><th>테스트</th><th class="num">스킬</th><th class="num">baseline</th>'+
   '<th class="num">스킬 시간</th><th class="num">baseline 시간</th></tr></thead><tbody>'+perEval+'</tbody></table>'+
   '<h2 class="sec">분석 노트</h2><ul class="notes">'+benchmark.notes.map(n=>'<li>'+esc(n)+'</li>').join('')+'</ul>';
}
window.setTab=t=>{curTab=t;render()};
window.setEval=i=>{curEval=i;render()};
render();
</script>`;

writeFileSync("review.html", html);
console.log("wrote review.html", (Buffer.byteLength(html)/1024).toFixed(0)+"KB");
