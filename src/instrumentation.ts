export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduler } = await import("@/lib/scheduler");
    const g = globalThis as unknown as { __subsSchedulerStarted?: boolean };
    if (!g.__subsSchedulerStarted) {
      g.__subsSchedulerStarted = true;
      startScheduler();
    }
  }
}
