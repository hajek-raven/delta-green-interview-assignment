import closeWithGrace from "close-with-grace";

// Match previous behavior: only SIGINT/SIGTERM trigger graceful shutdown.
const SKIP: closeWithGrace.AllEvents[] = [
  "SIGHUP",
  "SIGQUIT",
  "SIGILL",
  "SIGTRAP",
  "SIGABRT",
  "SIGBUS",
  "SIGFPE",
  "SIGSEGV",
  "SIGUSR2",
  "uncaughtException",
  "unhandledRejection",
  "beforeExit",
];

export function onShutdown(handler: () => Promise<void>) {
  return closeWithGrace({ skip: SKIP }, async ({ err }) => {
    if (err) {
      console.error(err);
    }
    await handler();
  });
}
