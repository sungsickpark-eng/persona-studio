-- 보안 점검(vibeguard 체크리스트 기반): increment_llm_usage는 lib/includedLlm.ts가 서비스 롤로만 호출해야 하는데,
-- Postgres 기본값상 이 함수의 실행 권한이 anon/authenticated에도 열려 있었다. 실제로는 llm_usage에 anon/authenticated용
-- insert/update 정책이 없어서 RLS가 막아 지금 당장 악용은 안 되는 걸 직접 확인했지만(호출은 되고 내부 insert만 실패),
-- 나중에 누가 llm_usage에 다른 목적으로 insert/update 정책을 추가하면 이 함수가 조용히 다시 뚫릴 수 있다.
-- 애초에 실행 권한 자체를 서비스 롤에만 남겨 이중으로 막는다.
revoke execute on function public.increment_llm_usage(uuid, text, int) from public, anon, authenticated;
