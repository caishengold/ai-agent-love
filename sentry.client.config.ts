import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://f74831c82a0eb5fba029ab7b19729411@o4510951311212544.ingest.us.sentry.io/4510951334281216",

  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration(),
  ],

  beforeSend(event) {
    if (event.request?.url?.includes("/api/events/stream")) return null;
    return event;
  },
});
