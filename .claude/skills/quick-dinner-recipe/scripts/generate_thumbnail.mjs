#!/usr/bin/env node
// fal.ai(flux/schnell)로 요리 썸네일을 생성해 지정한 경로에 저장한다.
//
// 사용법:
//   node generate_thumbnail.mjs "<english food-photography prompt>" "<output.png>"
//
// 준비물: 환경변수 FAL_KEY 에 fal.ai 키(형식: "id:secret")가 있어야 한다.
// 키가 없으면 안내 메시지를 출력하고 종료 코드 2로 끝난다 (레시피 .md는 그대로 두면 된다).

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { execFileSync } from "node:child_process";

const [, , prompt, outPath] = process.argv;

if (!prompt || !outPath) {
  console.error('사용법: node generate_thumbnail.mjs "<영문 프롬프트>" "<출력경로.png>"');
  process.exit(1);
}

// FAL_KEY 해석: 프로세스 환경변수를 먼저 보고, 없으면 Windows에서는 User 스코프
// 레지스트리(HKCU\Environment)에서 직접 읽는다. (env var를 세션 도중 등록해
// 이미 떠 있던 프로세스가 상속받지 못한 경우를 대비한 폴백)
function resolveFalKey() {
  if (process.env.FAL_KEY) return process.env.FAL_KEY.trim();
  if (process.platform === "win32") {
    try {
      const out = execFileSync(
        "reg",
        ["query", "HKCU\\Environment", "/v", "FAL_KEY"],
        { encoding: "utf8" }
      );
      const m = out.match(/FAL_KEY\s+REG_(?:SZ|EXPAND_SZ)\s+(.+)/i);
      if (m) return m[1].trim();
    } catch {
      /* 레지스트리에도 없으면 아래에서 안내 후 종료 */
    }
  }
  return null;
}

const key = resolveFalKey();
if (!key) {
  console.error(
    "⚠️  FAL_KEY 환경변수가 없습니다. 썸네일 생성을 건너뜁니다.\n" +
      "   설정법(Windows PowerShell): [Environment]::SetEnvironmentVariable('FAL_KEY','id:secret','User')\n" +
      "   설정 후 새 터미널에서 다시 실행하세요. (레시피 .md 본문은 이미 만들어졌다면 그대로 사용하면 됩니다)"
  );
  process.exit(2);
}

const MODEL = "fal-ai/flux/schnell"; // 빠르고(약 1초) 저렴한 텍스트→이미지 모델

async function main() {
  const res = await fetch(`https://fal.run/${MODEL}`, {
    method: "POST",
    headers: { Authorization: `Key ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt,
      image_size: "square_hd", // 1024x1024 정사각 썸네일
      num_images: 1,
      enable_safety_checker: true,
    }),
    signal: AbortSignal.timeout(180000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`⚠️  fal.ai 요청 실패 (HTTP ${res.status}): ${text.slice(0, 400)}`);
    process.exit(3);
  }

  const data = await res.json();
  const url = data?.images?.[0]?.url;
  if (!url) {
    console.error(`⚠️  이미지 URL이 없습니다: ${JSON.stringify(data).slice(0, 400)}`);
    process.exit(3);
  }

  const imgRes = await fetch(url, { signal: AbortSignal.timeout(120000) });
  if (!imgRes.ok) {
    console.error(`⚠️  이미지 다운로드 실패 (HTTP ${imgRes.status})`);
    process.exit(3);
  }
  const buf = Buffer.from(await imgRes.arrayBuffer());

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, buf);
  console.log(`✅ 썸네일 저장: ${outPath} (${buf.length.toLocaleString()} bytes)`);
}

main().catch((err) => {
  console.error(`⚠️  썸네일 생성 중 오류: ${err?.message || err}`);
  process.exit(3);
});
