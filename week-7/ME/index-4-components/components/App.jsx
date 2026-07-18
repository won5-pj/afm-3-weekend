// ============================================================
// App — 루트 컴포넌트 (모든 섹션 조립)
// 의존: Header, Hero, Marquee, CanDo, Models, Where, Values, CTA, Footer
// ============================================================
function App() {
  return (
    <div className="min-h-screen">
      <Header />
      <Hero />
      <Marquee items={['긴 문서 이해', '복잡한 추론', '코딩', '요약·번역', '에이전트 작업', '자연스러운 대화']} />
      <CanDo />
      <Models />
      <Where />
      <Values />
      <CTA />
      <Footer />
    </div>
  );
}
