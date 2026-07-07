export const PUBLIC_VIEW_KINDS = ["video", "show", "playlist", "wiki"] as const;
export type PublicViewKind = (typeof PUBLIC_VIEW_KINDS)[number];

const MAX_ID_FOR_KEY = 96;

function publicObjectToken(targetId: string) {
  return targetId.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, MAX_ID_FOR_KEY);
}

export function isPublicViewKind(value: unknown): value is PublicViewKind {
  return (
    typeof value === "string" &&
    PUBLIC_VIEW_KINDS.includes(value as PublicViewKind)
  );
}

export function publicViewStorageKey(kind: PublicViewKind, targetId: string) {
  return `osc-public-view:${kind}:${publicObjectToken(targetId)}`;
}

export function publicViewCookieName(kind: PublicViewKind, targetId: string) {
  return `osc_v_${kind}_${publicObjectToken(targetId)}`;
}
