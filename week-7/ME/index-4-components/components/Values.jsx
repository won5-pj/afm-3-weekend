// ============================================================
// Values — 섹션 "클로드의 지향점"
// 정직하게 / 무해하게 / 도움이 되게 (가운데 카드 살짝 위로)
// 의존: SectionTitle, Box
// ============================================================
function Values() {
  const items = [
    { k: '정직하게', color: 'bg-brutal-yellow', desc: '아는 것과 모르는 것을 솔직하게. 지어내지 않습니다.' },
    { k: '무해하게', color: 'bg-brutal-pink',   desc: '안전(safety)을 우선하며 해가 되지 않도록 행동합니다.' },
    { k: '도움이 되게', color: 'bg-brutal-green', desc: '진짜로 여러분에게 도움이 되는 방향을 지향합니다.' },
  ];
  return (
    <section id="values" className="border-b-4 border-black bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionTitle kicker="OUR VALUES" title="클로드의 지향점" color="bg-brutal-blue" />
        <div className="grid gap-6 md:grid-cols-3">
          {items.map((it, i) => (
            <Box key={i} color="bg-brutal-cream" className={`shadow-brutal p-8 ${i === 1 ? 'md:-translate-y-4' : ''}`}>
              <div className={`inline-block border-4 border-black ${it.color} px-4 py-2 shadow-brutal-sm -rotate-2`}>
                <span className="font-black text-2xl uppercase">{it.k}</span>
              </div>
              <p className="mt-5 font-mono font-bold text-lg leading-relaxed">{it.desc}</p>
            </Box>
          ))}
        </div>
        <p className="mt-10 font-mono font-black text-xl sm:text-2xl">
          Anthropic 은 <span className="bg-black text-brutal-yellow px-2">안전하고 도움이 되는 AI</span> 를 만드는 것을 지향합니다.
        </p>
      </div>
    </section>
  );
}
