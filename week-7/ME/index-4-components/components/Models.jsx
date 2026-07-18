// ============================================================
// Models — 섹션 "모델 라인업"
// Opus 4.8 / Haiku 4.5 / Claude 5 계열 카드 3장
// 의존: SectionTitle, Box
// ============================================================
function Models() {
  const models = [
    {
      tag: 'FLAGSHIP',
      name: 'Opus 4.8',
      color: 'bg-brutal-yellow',
      desc: '가장 강력한 추론. 어렵고 복잡한 문제, 대규모 코딩·에이전트 작업에 강합니다.',
      traits: ['깊은 추론', '대형 작업', '고품질'],
    },
    {
      tag: 'FAST',
      name: 'Haiku 4.5',
      color: 'bg-brutal-green',
      desc: '가볍고 빠른 응답. 빠른 속도가 중요한 작업과 대량 처리에 잘 맞아요.',
      traits: ['빠름', '경량', '효율적'],
    },
    {
      tag: 'FAMILY',
      name: 'Claude 5 계열',
      color: 'bg-brutal-blue',
      textColor: 'text-white',
      desc: '최신 세대 모델 패밀리. 용도에 따라 강력함과 속도의 라인업을 골라 쓸 수 있습니다.',
      traits: ['라인업', '최신 세대', '선택지'],
    },
  ];

  return (
    <section id="models" className="border-b-4 border-black bg-brutal-cream">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionTitle kicker="MODEL LINEUP" title="모델 라인업" color="bg-brutal-green" textColor="text-black" />
        <div className="grid gap-6 md:grid-cols-3">
          {models.map((m, i) => (
            <Box key={i} color="bg-white" className="press shadow-brutal-lg p-0 overflow-hidden flex flex-col">
              <div className={`border-b-4 border-black ${m.color} ${m.textColor || 'text-black'} px-6 py-4 flex items-center justify-between`}>
                <span className="font-mono font-black uppercase text-sm">{m.tag}</span>
                <span className="font-mono font-black">0{i + 1}</span>
              </div>
              <div className="p-6 flex flex-col flex-1">
                <h3 className="font-black text-3xl uppercase leading-none tracking-tight">{m.name}</h3>
                <p className="mt-4 font-mono font-bold leading-relaxed flex-1">{m.desc}</p>
                <div className="mt-5 flex flex-wrap gap-2">
                  {m.traits.map(t => (
                    <span key={t} className="border-2 border-black bg-brutal-cream px-2 py-1 font-mono text-xs font-bold uppercase">#{t}</span>
                  ))}
                </div>
              </div>
            </Box>
          ))}
        </div>
        <p className="mt-8 font-mono text-sm font-bold opacity-70">
          ※ 라인업은 강력한 추론의 Opus, 빠른 Haiku 처럼 용도에 맞춰 구성돼요.
        </p>
      </div>
    </section>
  );
}
