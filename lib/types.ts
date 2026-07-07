export type ActionResult = { ok: true; message?: string } | { ok: false; error: string };

export type FormState =
  | { error?: string; fieldErrors?: Record<string, string[]> }
  | undefined;
