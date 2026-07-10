# mybudget-analyst SQL 쿡북

`mybudget-analyst` 에이전트가 Supabase MCP `execute_sql` 로 실행하는 **읽기 전용(SELECT)** 쿼리 모음.
모든 "이번 달/지난 달"은 `current_date` 기준으로 계산해 날짜 하드코딩을 피한다.

> 테이블: `budget_entries(id, type, category, amount, memo, date, created_at)`, `budgets(category, amount)`
> `type` = `income`/`expense`, `budgets.category='__total__'` = 전체 예산.

---

## ① 기본조회

**이번 달 총수입·총지출·잔액**
```sql
select
  coalesce(sum(amount) filter (where type='income'),  0)::float8 as income,
  coalesce(sum(amount) filter (where type='expense'), 0)::float8 as expense,
  coalesce(sum(amount) filter (where type='income'),  0)::float8
    - coalesce(sum(amount) filter (where type='expense'), 0)::float8 as balance
from budget_entries
where date_trunc('month', date) = date_trunc('month', current_date);
```

**특정 카테고리(예: 식비) 최다 지출일 — 이번 달**
```sql
select date, sum(amount)::float8 as total, count(*) as cnt
from budget_entries
where type='expense' and category='식비'
  and date_trunc('month', date) = date_trunc('month', current_date)
group by date order by total desc limit 1;
```

**카테고리별 지출 순위 — 이번 달**
```sql
select category, sum(amount)::float8 as total, count(*) as cnt
from budget_entries
where type='expense' and date_trunc('month', date) = date_trunc('month', current_date)
group by category order by total desc;
```

**최근 지출 내역 N건**
```sql
select to_char(date,'YYYY-MM-DD') as date, category, amount::float8 as amount, memo
from budget_entries
where type='expense'
order by date desc, id desc limit 10;
```

**하루 최다 지출일 (전체 기간, 지출 합 기준)**
```sql
select date, sum(amount)::float8 as total
from budget_entries
where type='expense'
group by date order by total desc limit 5;
```

---

## ② 패턴분석

**주중 vs 주말 지출 (총액 + 하루 평균)** — 주중 5일·주말 2일이라 하루 평균으로 비교하는 게 공정.
```sql
with e as (
  select amount, extract(dow from date) as dow, date
  from budget_entries
  where type='expense' and date_trunc('month', date) = date_trunc('month', current_date)
)
select
  case when dow in (0,6) then '주말' else '주중' end as part,
  sum(amount)::float8 as total,
  count(*) as cnt,
  count(distinct date) as active_days,
  (sum(amount)/nullif(count(distinct date),0))::float8 as avg_per_active_day
from e group by part;
```

**카테고리별 비율(%) — 이번 달**
```sql
select category, sum(amount)::float8 as total,
       round(100.0 * sum(amount) / sum(sum(amount)) over (), 1) as pct
from budget_entries
where type='expense' and date_trunc('month', date) = date_trunc('month', current_date)
group by category order by total desc;
```

**정기 vs 비정기 지출** — 여러 달 반복 등장(`months_seen>=2`)이면 정기성으로 본다.
```sql
select category, memo,
       count(distinct date_trunc('month', date)) as months_seen,
       count(*) as cnt, sum(amount)::float8 as total
from budget_entries
where type='expense'
group by category, memo
order by months_seen desc, total desc;
```
데이터가 한 달치뿐이면 카테고리 성격으로 잠정 분류: 정기(주거·구독료·교통정기) / 비정기(식비·여가·쇼핑·경조사).

**월별 지출 추이 (최근 6개월)**
```sql
select to_char(date_trunc('month', date),'YYYY-MM') as month,
       sum(amount)::float8 as expense
from budget_entries
where type='expense'
  and date >= date_trunc('month', current_date) - interval '5 months'
group by month order by month;
```

**요일별 평균 지출**
```sql
select extract(dow from date) as dow,
       sum(amount)::float8 as total, count(*) as cnt
from budget_entries
where type='expense'
group by dow order by dow;   -- 0=일 … 6=토
```

---

## ③ 절약조언

**예산 대비 사용률 — 이번 달** (80%↑ 주의, 100%↑ 초과)
```sql
select b.category, b.amount::float8 as budget,
       coalesce(sum(e.amount) filter (
         where date_trunc('month', e.date) = date_trunc('month', current_date)), 0)::float8 as spent,
       round(100.0 * coalesce(sum(e.amount) filter (
         where date_trunc('month', e.date) = date_trunc('month', current_date)),0) / b.amount, 1) as used_pct
from budgets b
left join budget_entries e on e.category = b.category and e.type='expense'
where b.category <> '__total__'
group by b.category, b.amount
order by used_pct desc nulls last;
```

**전체 예산 대비 — 이번 달**
```sql
select (select amount::float8 from budgets where category='__total__') as total_budget,
       coalesce(sum(amount),0)::float8 as spent
from budget_entries
where type='expense' and date_trunc('month', date) = date_trunc('month', current_date);
```

**다음 달 지출 예측 — 지난 완료월 카테고리별 월평균**
```sql
select category, avg(m_total)::float8 as avg_monthly
from (
  select category, date_trunc('month', date) as m, sum(amount) as m_total
  from budget_entries
  where type='expense'
    and date >= date_trunc('month', current_date) - interval '6 months'
    and date <  date_trunc('month', current_date)      -- 이번 달(진행중) 제외
  group by category, m
) t group by category order by avg_monthly desc;
```
카테고리 합계가 다음 달 예상 총지출. 완료월이 적으면 아래 러프 예측 사용.

**이번 달 현재 페이스로 러프 예측** — (현재까지 지출 ÷ 경과일) × 그 달 총일수
```sql
select sum(amount)::float8 as mtd,
       (sum(amount) / extract(day from current_date)
         * extract(day from (date_trunc('month', current_date) + interval '1 month' - interval '1 day'))
       )::float8 as projected_month_end
from budget_entries
where type='expense' and date_trunc('month', date) = date_trunc('month', current_date);
```

**지난달 대비 카테고리별 증감** — 어디서 늘었는지 짚어 절약 포인트 찾기
```sql
select category,
       coalesce(sum(amount) filter (where date_trunc('month',date)=date_trunc('month',current_date)),0)::float8 as this_month,
       coalesce(sum(amount) filter (where date_trunc('month',date)=date_trunc('month',current_date - interval '1 month')),0)::float8 as last_month
from budget_entries
where type='expense'
  and date >= date_trunc('month', current_date - interval '1 month')
group by category
order by (this_month - last_month) desc;
```
