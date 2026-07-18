// ============================================================
// CanDo — 섹션 "내가 할 수 있는 일"
// 6개 카드 그리드 (각 카드 살짝 회전 + 호버 시 정렬·눌림)
// 의존: SectionTitle, Box
// ============================================================
function CanDo() {
  const cards = [
    { emoji: '📚', color: 'bg-brutal-yellow', title: '긴 문서 이해', desc: '방대한 문서·리포트·코드베이스를 통째로 읽고 핵심을 뽑아내요.' },
    { emoji: '🧠', color: 'bg-brutal-pink',   title: '복잡한 추론',  desc: '여러 단계를 거쳐야 하는 어려운 문제도 차근차근 풀어냅니다.' },
    { emoji: '💬', color: 'bg-brutal-green',  title: '자연스러운 대화', desc: '맥락을 기억하며 사람처럼 자연스럽게 이야기를 이어가요.' },
    { emoji: '📝', color: 'bg-brutal-blue',   title: '요약·번역·분석', textColor: 'text-white', desc: '긴 글을 요약하고, 언어를 넘나들며 번역하고, 데이터를 분석해요.' },
    { emoji: '💻', color: 'bg-brutal-red',    title: '코딩 & 작성',  textColor: 'text-white', desc: '코드를 읽고 쓰고 고쳐요. 문서·이메일·기획서 작성도 척척.' },
    { emoji: '🤖', color: 'bg-white',         title: '에이전트형 작업', desc: '도구를 직접 쓰며 여러 단계의 작업을 알아서 수행합니다.' },
  ];

  return (
    <section id="can-do" className="border-b-4 border-black bg-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:py-24">
        <SectionTitle kicker="WHAT I CAN DO" title="내가 할 수 있는 일" color="bg-brutal-red" />
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c, i) => (
            <Box
              key={i}
              color={c.color}
              className={`press shadow-brutal p-6 ${c.textColor || 'text-black'} ${i % 2 ? 'rotate-1' : '-rotate-1'} hover:rotate-0`}
            >
              <div className="text-5xl mb-4">{c.emoji}</div>
              <h3 className="font-mono font-black text-2xl uppercase leading-none">{c.title}</h3>
              <p className="mt-3 font-mono font-bold leading-relaxed">{c.desc}</p>
            </Box>
          ))}
        </div>
      </div>
    </section>
  );
}
