import "server-only";

export function getKakaoRestKey(): string | undefined {
  return process.env.KAKAO_REST_API_KEY?.trim() || undefined;
}
