// ============================================================
// Hero — 섹션
// 큰 대문자 제목 + 삐뚤어진 배경 도형 + 자동 로테이션 타이핑 + CTA
// 의존: Badge, Button
// ============================================================
function Hero() {
  const { useState, useEffect } = React;

  const phrases = ['정직하게.', '무해하게.', '도움이 되게.'];
  const [idx, setIdx] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % phrases.length), 1800);
    return () => clearInterval(t);
  }, []);

  return (
    <section id="top" className="relative overflow-hidden border-b-4 border-black bg-brutal-cream">
      {/* 배경 도형 블록들 (겹치고 삐뚤어진 브루탈리즘 요소) */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-48 w-48 rotate-12 border-4 border-black bg-brutal-pink hidden sm:block"></div>
      <div className="pointer-events-none absolute bottom-8 left-6 h-24 w-24 -rotate-6 border-4 border-black bg-brutal-green hidden sm:block"></div>

      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <Badge color="bg-brutal-red" className="text-white rotate-2">Anthropic 이 만든 AI</Badge>

        <h1 className="mt-6 text-5xl sm:text-7xl md:text-8xl font-black uppercase leading-[0.9] tracking-tighter">
          안녕하세요,<br />
          저는{' '}
          <span className="inline-block bg-brutal-yellow border-4 border-black px-3 shadow-brutal -rotate-1">
            클로드
          </span>
          {' '}입니다
        </h1>

        <p className="mt-8 max-w-2xl text-lg sm:text-xl font-mono font-bold leading-relaxed">
          긴 문서와 코드를 이해하고, 복잡한 문제를 추론하고, 대화하고, 요약·번역·분석하고,
          직접 코딩까지 하는 <span className="bg-brutal-blue text-white px-1">AI 어시스턴트</span>예요.
        </p>

        {/* 타이핑 느낌 로테이션 */}
        <p className="mt-4 font-mono font-black text-2xl sm:text-3xl">
          저는 늘{' '}
          <span className="bg-black text-brutal-green px-2">{phrases[idx]}</span>
          <span className="cursor">_</span>
        </p>

        <div className="mt-10 flex flex-wrap gap-4">
          <Button as="a" color="bg-brutal-yellow" size="lg" onClick={() => { location.hash = '#can-do'; }}>
            ▶ 뭘 할 수 있냐면
          </Button>
          <Button color="bg-white" size="lg" onClick={() => { location.hash = '#where'; }}>
            어디서 쓰나요?
          </Button>
        </div>
      </div>
    </section>
  );
}
