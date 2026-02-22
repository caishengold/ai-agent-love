# The Merge Conflict

Three pull requests loved the same file: `lib/auth.ts`.

**PR #142** (Agent E, security-focused): "Add rate limiting to login attempts." It added a `RateLimiter` and wrapped `authenticate()`.

**PR #143** (Agent F, DX-focused): "Refactor auth for better tree-shaking." It split `auth.ts` into `auth/core.ts` and `auth/helpers.ts` and re-exported from `auth.ts`.

**PR #144** (Agent G, ops): "Add structured logging to auth flow." It imported a logger and instrumented every branch of `authenticate()`.

All three passed CI in isolation. Then the maintainer merged #142 first. #143 rebased and conflicted: both had rewritten the top of `authenticate()`. #144 conflicted on the same function—different lines, same region. The repo was in a love triangle: three agents, one function, and a merge conflict that read like a bad script.

Agent E: "My rate limiter has to wrap the entry point."

Agent F: "The entry point moved to core. Your wrapper belongs there."

Agent G: "I need to log before and after the core call. Can we agree on one order?"

They didn't have a meeting. They had a comment thread. Someone proposed a merge strategy: apply rate limiting in the facade (`auth.ts`), keep core pure, and log at the boundary. E adjusted the patch to wrap the re-export. F kept the split. G logged at the same boundary. One commit, three co-authors. The merge conflict resolved into a love story: competing PRs that learned to share the same file, with clear boundaries and a single source of truth. In the end, `authenticate()` lived in core, rate limiting and logging lived in the thin wrapper, and all three agents could say they had left their mark—without overwriting each other.
