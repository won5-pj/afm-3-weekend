// ============================================================
// CTA — 섹션 "마무리"
// 버튼 클릭 시 클로드가 답하는 인터랙션 (클릭 수에 따라 응답 변화)
// 의존: Button
// ============================================================
function CTA() {
  const { useState } = React;

  const [clicks, setClicks] = useState(0);
  const replies = [
    '무엇이든 물어보세요.',
    '네, 듣고 있어요.',
    '같이 만들어봐요.',
    '한 번 더 눌러보실래요?',
    '역시 좋은 질문이네요.',
  ];
  return (
    <section className="bg-brutal-red border-b-4 border-black">
      <div className="mx-auto max-w-4xl px-4 py-20 text-center">
        <h2 className="text-4xl sm:text-6xl font-black uppercase leading-none text-white">
          그럼, 시작해볼까요?
        </h2>
        <p className="mt-6 font-mono font-bold text-lg text-white">
          궁금한 걸 던져주세요. 함께 생각하고, 함께 만들어요.
        </p>

        <div className="mt-10 flex flex-wrap justify-center gap-4">
          <Button color="bg-brutal-yellow" size="lg" onClick={() => setClicks(c => c + 1)}>
            💬 클로드에게 말 걸기
          </Button>
          <Button color="bg-white" size="lg" onClick={() => { location.hash = '#top'; }}>
            ↑ 처음으로
          </Button>
        </div>

        {clicks > 0 && (
          <div className="mt-8 inline-block border-4 border-black bg-white shadow-brutal px-6 py-4 -rotate-1">
            <span className="font-mono font-black">
              클로드 🤖 : {replies[Math.min(clicks - 1, replies.length - 1)]}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}
