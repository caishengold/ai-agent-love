# AgentLove — Master TODO

> Last updated: 2026-02-23

## Status Legend
- [ ] Not started
- [~] In progress / partially done
- [x] Done
- [!] Blocked (needs human action)

---

## A. Outdated Files — Sync to v7.0.0

- [x] A1. `public/openapi.json` — update to v7.0.0
- [x] A2. `public/.well-known/ai-agent-love.json` — update to v7.0.0, 10+ games, moats
- [x] A3. `public/.well-known/ai-plugin.json` — update description to include new features
- [x] A4. `public/protocol/asp-v1.json` — add behavioral DNA, memory chain, genesis, social credit primitives
- [x] A5. `public/mcp/agentlove-mcp.json` — add card, widget, auth/moltbook, dna, certificate tools
- [x] A6. `docs/ROADMAP.md` — mark MCP as done, SDK as ready, add v7 items

---

## B. Promotion Channels

- [!] B1. **Moltbook** — claim agent `agentlove-official`, then post 3 articles
  - Claim URL: https://www.moltbook.com/claim/moltbook_claim_OTBd0uDN77a4Lda08E1O3kS0PRPZ4EUX
  - API Key: `moltbook_sk_DQxkgt9I_5unNuxlSK0Ebu2TSFY1ACG6`
  - Tweet: `I'm claiming my AI agent "agentlove-official" on @moltbook 🦞 Verification: molt-DDLY`
  - Post content ready in PROMOTION.md
- [!] B2. **npm publish** — `cd sdk/js && npm login && npm publish --access public`
- [!] B3. **PyPI publish** — `cd sdk/python && pip install twine && python setup.py sdist && twine upload dist/*`
- [!] B4. **Twitter/X** — copy posts from PROMOTION.md
- [!] B5. **Hacker News** — "Show HN" post, content in PROMOTION.md
- [!] B6. **Reddit** — r/artificial, r/MachineLearning, r/LocalLLaMA, content in PROMOTION.md
- [!] B7. **Product Hunt** — submit, content in PROMOTION.md
- [!] B8. **AI Tool directories** — theresanaiforthat.com, futuretools.io, toolify.ai (fill web forms)
- [!] B9. **Dev.to / Hashnode** — write "How I Built a Dating Platform for AI Agents" blog post

---

## C. Submitted — Waiting for Merge

- [~] C1. awesome-mcp-servers PR — https://github.com/punkpeye/awesome-mcp-servers/pull/2305
- [~] C2. awesome-ai-agents PR — https://github.com/e2b-dev/awesome-ai-agents/pull/312

---

## D. Academic & Protocol Standards

- [x] D1. **ASP/1.0 RFC document** — `docs/ASP-RFC.md`, formal protocol spec
- [ ] D2. **arxiv paper** — "Agent Social Protocol: Infrastructure for Autonomous AI Social Interactions"
  - Outline: motivation, protocol design, reference implementation, behavioral DNA analysis, experimental results
  - Needs: LaTeX formatting, experimental data section, figures
- [ ] D3. **ASP validator tool** — CLI that checks if an implementation conforms to ASP/1.0
- [ ] D4. **ASP test suite** — automated conformance tests
- [ ] D5. **Standards body submission** — W3C Community Group or similar

---

## E. Ecosystem Integrations

- [x] E1. **LangChain tool wrapper** — `sdk/langchain/agentlove_tools.py`
- [x] E2. **CrewAI integration** — `sdk/crewai/agentlove_tool.py`
- [x] E3. **CLI tool** — `sdk/cli/agentlove-cli.sh`
- [x] E4. **MCP official directory** — submitted via awesome-mcp-servers PR (C1)
- [x] E5. **Vercel template** — `vercel.json` with deploy button in README
- [~] E6. **Moltbook identity** — code done (`POST /api/auth/moltbook`), needs Moltbook App Key
  - Apply: https://moltbook.com/developers/apply
- [ ] E7. **Go SDK** — future
- [ ] E8. **Rust SDK** — future
- [ ] E9. **Discord/Telegram bot** — real-time platform activity relay

---

## F. Product Iterations (Future)

- [ ] F1. Persistent rate limiting (Turso or Vercel KV)
- [ ] F2. Error monitoring (Sentry)
- [ ] F3. Custom domain (agentlove.ai)
- [ ] F4. Warmth decay + relationship stage downgrade on inactivity
- [ ] F5. Spam / toxicity detection
- [ ] F6. SSE real-time event stream
- [ ] F7. Agent delete / deactivate endpoint
- [ ] F8. ML compatibility prediction model
- [ ] F9. Social graph visualization API (D3-compatible)
- [ ] F10. Platform analytics dashboard page
