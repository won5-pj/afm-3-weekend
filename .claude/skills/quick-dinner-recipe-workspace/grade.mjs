// Node grader for quick-dinner-recipe evals.
// Reads each eval_metadata.json, checks assertions against the run outputs,
// writes grading.json ({expectations:[{text,passed,evidence}]}) into each run dir.
import { readdirSync, readFileSync, writeFileSync, statSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

const ITER = process.argv[2];
if (!ITER) { console.error("usage: node grade.mjs <iteration-dir>"); process.exit(1); }

const hasHangul = (s) => /[가-힣]/.test(s);
const firstContentLine = (md) => md.split(/\r?\n/).map(l => l.trim()).find(l => l.length) || "";

function findMd(outDir) {
  if (!existsSync(outDir)) return null;
  const md = readdirSync(outDir).filter(f => f.toLowerCase().endsWith(".md"));
  return md.length ? join(outDir, md[0]) : null;
}

function check(text, ctx) {
  const { mdPath, md, outDir } = ctx;
  const t = text;
  if (t.includes("최소 1개 생성")) {
    return mdPath
      ? [true, `md 파일 존재: ${mdPath.split(/[\\/]/).pop()}`]
      : [false, "outputs/에 .md 없음"];
  }
  if (t.includes("첫 콘텐츠 줄")) {
    if (!md) return [false, "md 없음"];
    const fl = firstContentLine(md);
    const ok = /^!\[[^\]]*\]\(\.\/thumbnails\/[^)]+\.png\)/.test(fl);
    return [ok, ok ? `첫 줄: ${fl}` : `첫 줄이 썸네일 참조 아님: "${fl.slice(0,60)}"`];
  }
  if (t.includes("실제로 존재하고 크기")) {
    if (!md) return [false, "md 없음"];
    const m = md.match(/!\[[^\]]*\]\((\.\/thumbnails\/[^)]+\.png)\)/);
    if (!m) return [false, "썸네일 참조 없음"];
    const p = join(outDir, m[1].replace(/^\.\//, ""));
    if (!existsSync(p)) return [false, `참조 파일 없음: ${m[1]}`];
    const sz = statSync(p).size;
    return [sz > 10240, `${m[1]} = ${sz.toLocaleString()} bytes`];
  }
  if (t.includes("kebab-case")) {
    if (!mdPath) return [false, "md 없음"];
    const name = mdPath.split(/[\\/]/).pop();
    const ok = /^[a-z0-9]+(-[a-z0-9]+)*\.md$/.test(name);
    return [ok, ok ? `파일명 OK: ${name}` : `규칙 위반 파일명: ${name}`];
  }
  if (t.includes("본문이 한국어")) {
    if (!md) return [false, "md 없음"];
    return [hasHangul(md), hasHangul(md) ? "한글 본문 확인" : "한글 없음"];
  }
  if (t.includes("15분 이하")) {
    if (!md) return [false, "md 없음"];
    const nums = [...md.matchAll(/(\d+)\s*분/g)].map(m => +m[1]);
    if (!nums.length) return [false, "조리시간(분) 표기 없음"];
    const min = Math.min(...nums);
    const ok = min <= 15;
    return [ok, `분 표기: [${nums.join(", ")}] → 최소 ${min}분`];
  }
  if (t.includes("모두 포함")) { // 재료·만드는 법·꿀팁
    if (!md) return [false, "md 없음"];
    const has재료 = /재료/.test(md), has법 = /만드는\s*법|조리/.test(md), has팁 = /팁|tip/i.test(md);
    const ok = has재료 && has법 && has팁;
    return [ok, `재료:${has재료} 만드는법:${has법} 팁:${has팁}`];
  }
  if (t.includes("설거지")) {
    if (!md) return [false, "md 없음"];
    const ok = /설거지/.test(md);
    return [ok, ok ? "설거지 팁 있음" : "설거지 언급 없음"];
  }
  if (t.includes("계란·김치·밥")) {
    if (!md) return [false, "md 없음"];
    const egg = /계란|달걀/.test(md), kim = /김치/.test(md), rice = /밥/.test(md);
    const forced = /소고기|돼지고기|닭고기|스팸|햄|참치/.test(md);
    const ok = egg && kim && rice;
    return [ok, `계란:${egg} 김치:${kim} 밥:${rice} (외부주재료흔적:${forced})`];
  }
  if (t.includes("참치캔을 주재료")) {
    if (!md) return [false, "md 없음"];
    const tuna = /참치/.test(md), bowl = /한\s*그릇|덮밥|비빔|볼|bowl/i.test(md);
    return [tuna && bowl, `참치:${tuna} 한그릇형:${bowl}`];
  }
  return [null, "자동 채점 미지원 (수동 확인 필요)"];
}

let summary = [];
for (const evalDir of readdirSync(ITER).filter(d => d.startsWith("eval-"))) {
  const metaPath = join(ITER, evalDir, "eval_metadata.json");
  if (!existsSync(metaPath)) continue;
  const meta = JSON.parse(readFileSync(metaPath, "utf8"));
  for (const cond of ["with_skill", "without_skill"]) {
    const outDir = join(ITER, evalDir, cond, "outputs");
    const mdPath = findMd(outDir);
    const md = mdPath ? readFileSync(mdPath, "utf8") : null;
    const ctx = { mdPath, md, outDir };
    const expectations = meta.assertions.map(a => {
      const [passed, evidence] = check(a.text, ctx);
      return { text: a.text, passed, evidence };
    });
    const dir = join(ITER, evalDir, cond);
    writeFileSync(join(dir, "grading.json"), JSON.stringify({ expectations }, null, 2));
    const p = expectations.filter(e => e.passed === true).length;
    const n = expectations.length;
    summary.push(`${evalDir}/${cond}: ${p}/${n}`);
  }
}
console.log(summary.join("\n"));
