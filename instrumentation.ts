// Next.js runs register() once when the server boots — the one hook we get on
// hosts that control the start command themselves.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    try {
      const { ensureDatabase } = await import("@/lib/bootstrap-db");
      await ensureDatabase();
    } catch (e) {
      // A failed bootstrap shouldn't kill the server — pages will surface the
      // real error, and the next restart retries.
      console.error("[bootstrap] failed:", e);
    }
  }
}
