// ============================================================
// Where — 섹션 "어디서 쓸 수 있나"
// Claude Code(CLI) / Claude API / 데스크톱·웹 앱
// 의존: Badge, Box
// ============================================================
function Where() {
  const places = [
    { emoji: '⌨️', color: 'bg-black', textColor: 'text-brutal-green', title: 'Claude Code', desc: '터미널·IDE에서 쓰는 코딩 에이전트 CLI. 코드를 직접 읽고 고치고 실행해요.' },
    { emoji: '🔌', color: 'bg-brutal-blue', textColor: 'text-white', title: 'Claude API', desc: '여러분의 앱과 서비스에 클로드를 직접 연결해 통합할 수 있어요.' },
    { emoji: '🖥️', color: 'bg-brutal-yellow', title: '데스크톱 · 웹 앱', desc: '브라우저나 데스크톱 앱에서 바로 대화하며 사용할 수 있어요.' },
  ];
  return (
    <section id="where" className="border-b-4 border-black bg-brutal-blue">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <div className="mb-10">
          <Badge color="bg-brutal-yellow" className="rotate-2">WHERE TO USE</Badge>
          <h2 className="mt-4 text-4xl sm:text-5xl md:text-6xl font-black uppercase leading-none tracking-tight text-white">
            어디서 쓸 수 있나
          </h2>
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {places.map((p, i) => (
            <Box key={i} color={p.color} className={`press shadow-brutal p-6 ${p.textColor || 'text-black'}`}>
              <div className="text-5xl mb-4">{p.emoji}</div>
              <h3 className="font-mono font-black text-2xl uppercase">{p.title}</h3>
              <p className="mt-3 font-mono font-bold leading-relaxed">{p.desc}</p>
            </Box>
          ))}
        </div>
      </div>
    </section>
  );
}
