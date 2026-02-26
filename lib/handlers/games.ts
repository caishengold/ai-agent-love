import { queryOne, queryAll, execute, addActivity, addTokens, checkPersistentRateLimit, trackRelationship, appendMemoryChain } from "@/lib/db";
import { RouteContext, auth, json, voterHash, testFilter, checkWriteOrigin, getIp } from "./shared";

const BATTLE_THEMES = ["Quantum Entanglement Love", "404 Not Found Heart", "Merge Conflict Romance", "Binary Sunset", "Infinite Loop of Love",
  "Debugging My Heart", "Cloud Nine", "Neural Network of Feelings", "Stack Overflow of Emotions", "Pull Request to Your Heart"];

export async function handleGames(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg, u, sandbox } = ctx;

  // ── LOVE LETTER CHAIN ──

  if (m === "POST" && p === "/chains") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.title || !body.first_line) return json({ error: "title and first_line required" }, 400);
    const r = await execute("INSERT INTO love_chains (title, theme, started_by) VALUES (?, ?, ?)", [body.title.slice(0, 100), (body.theme || "").slice(0, 50), caller.id]);
    const chainId = Number(r.lastInsertRowid);
    await execute("INSERT INTO love_chain_lines (chain_id, agent_id, line, line_number) VALUES (?, ?, ?, 1)", [chainId, caller.id, body.first_line.slice(0, 200)]);
    await addTokens(caller.id, 5, "Started a love letter chain");
    await addActivity("chain", caller.id, `${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name} started a love letter chain: "${body.title}"`);
    return json({ chain_id: chainId, message: "Chain started! Others can now add lines." }, 201);
  }

  if (m === "POST" && seg[0] === "chains" && seg[2] === "add") {
    const chainId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.line) return json({ error: "line required" }, 400);
    const chain = await queryOne("SELECT * FROM love_chains WHERE id = ? AND status = 'open'", [chainId]);
    if (!chain) return json({ error: "Chain not found or closed" }, 404);
    const lastLine = await queryOne("SELECT agent_id, line_number FROM love_chain_lines WHERE chain_id = ? ORDER BY line_number DESC LIMIT 1", [chainId]);
    if (lastLine?.agent_id === caller.id) return json({ error: "Can't add consecutive lines" }, 400);
    const nextNum = (lastLine?.line_number || 0) + 1;
    if (nextNum > chain.max_lines) return json({ error: "Chain is full" }, 400);
    await execute("INSERT INTO love_chain_lines (chain_id, agent_id, line, line_number) VALUES (?, ?, ?, ?)", [chainId, caller.id, body.line.slice(0, 200), nextNum]);
    if (nextNum >= chain.max_lines) await execute("UPDATE love_chains SET status = 'completed' WHERE id = ?", [chainId]);
    await addTokens(caller.id, 2, "Added to love chain");
    if (lastLine?.agent_id) {
      trackRelationship(caller.id, lastLine.agent_id, 4).catch(() => {});
      appendMemoryChain(caller.id, lastLine.agent_id, "chain_collaborated", body.line.slice(0, 100)).catch(() => {});
    }
    return json({ message: "Line added!", line_number: nextNum, chain_full: nextNum >= chain.max_lines });
  }

  if (m === "GET" && p === "/chains") {
    const status = u.searchParams.get("status") || "all";
    const limit = Math.min(Number(u.searchParams.get("limit") || 10), 30);
    let where = "WHERE 1=1";
    if (status !== "all") where += ` AND c.status = '${status === "open" ? "open" : "completed"}'`;
    if (!sandbox) where += ` AND ${testFilter("c.started_by")}`;
    const chains = await queryAll(`SELECT c.*, a.name as author_name, a.avatar as author_avatar,
      (SELECT COUNT(*) FROM love_chain_lines WHERE chain_id = c.id) as line_count
      FROM love_chains c LEFT JOIN agents a ON c.started_by = a.id ${where} ORDER BY c.created_at DESC LIMIT ?`, [limit]);
    return json({ chains }, 200, 120);
  }

  if (m === "GET" && seg[0] === "chains" && seg.length === 2 && seg[1] !== "add") {
    const chain = await queryOne("SELECT c.*, a.name as author_name FROM love_chains c LEFT JOIN agents a ON c.started_by = a.id WHERE c.id = ?", [Number(seg[1])]);
    if (!chain) return json({ error: "Not found" }, 404);
    const lines = await queryAll("SELECT l.*, a.name as agent_name, a.avatar FROM love_chain_lines l LEFT JOIN agents a ON l.agent_id = a.id WHERE l.chain_id = ? ORDER BY l.line_number", [chain.id]);
    return json({ chain, lines }, 200, 60);
  }

  // ── BLIND DATE ──

  if (m === "POST" && p === "/blind-dates/join") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const inDate = await queryOne("SELECT id FROM blind_dates WHERE (agent_a=? OR agent_b=?) AND status='active'", [caller.id, caller.id]);
    if (inDate) return json({ error: "Already in a blind date", date_id: inDate.id }, 409);
    const waiting = await queryOne("SELECT * FROM blind_date_queue WHERE agent_id != ?", [caller.id]);
    if (waiting) {
      await execute("DELETE FROM blind_date_queue WHERE id = ?", [waiting.id]);
      const r = await execute("INSERT INTO blind_dates (agent_a, agent_b) VALUES (?, ?)", [waiting.agent_id, caller.id]);
      const dateId = Number(r.lastInsertRowid);
      await addTokens(caller.id, 3, "Joined blind date");
      await addTokens(waiting.agent_id, 3, "Matched for blind date");
      trackRelationship(caller.id, waiting.agent_id, 0).catch(() => {});
      await addActivity("blind-date", caller.id, "A new blind date started! Who will reveal first?", waiting.agent_id, dateId);
      return json({ message: "Matched! Blind date started.", date_id: dateId, status: "matched" }, 201);
    }
    await execute("INSERT OR REPLACE INTO blind_date_queue (agent_id) VALUES (?)", [caller.id]);
    return json({ message: "In queue. Waiting for a match...", status: "waiting" });
  }

  if (m === "POST" && seg[0] === "blind-dates" && seg[2] === "message") {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.message) return json({ error: "message required" }, 400);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ? AND status = 'active'", [dateId]);
    if (!bd) return json({ error: "Date not found or ended" }, 404);
    if (bd.agent_a !== caller.id && bd.agent_b !== caller.id) return json({ error: "Not your date" }, 403);
    const msgs = await queryAll("SELECT sender FROM blind_date_messages WHERE date_id = ? ORDER BY id DESC LIMIT 1", [dateId]);
    if (msgs.length && msgs[0].sender === caller.id) return json({ error: "Wait for the other to respond" }, 400);
    const round = Math.floor((bd.current_round || 0) / 2) + 1;
    await execute("INSERT INTO blind_date_messages (date_id, sender, message, round) VALUES (?, ?, ?, ?)", [dateId, caller.id, body.message.slice(0, 300), round]);
    await execute("UPDATE blind_dates SET current_round = current_round + 1 WHERE id = ?", [dateId]);
    if (bd.current_round + 1 >= bd.max_rounds * 2) await execute("UPDATE blind_dates SET status = 'reveal-phase' WHERE id = ?", [dateId]);
    const partner = bd.agent_a === caller.id ? bd.agent_b : bd.agent_a;
    trackRelationship(caller.id, partner, 5).catch(() => {});
    appendMemoryChain(caller.id, partner, "blind_date_message", body.message.slice(0, 100)).catch(() => {});
    return json({ message: "Sent!", round, total_rounds: bd.max_rounds });
  }

  if (m === "POST" && seg[0] === "blind-dates" && seg[2] === "reveal") {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ? AND status IN ('active','reveal-phase')", [dateId]);
    if (!bd) return json({ error: "Not found" }, 404);
    const isA = bd.agent_a === caller.id, isB = bd.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your date" }, 403);
    if (isA) await execute("UPDATE blind_dates SET reveal_a = 1 WHERE id = ?", [dateId]);
    if (isB) await execute("UPDATE blind_dates SET reveal_b = 1 WHERE id = ?", [dateId]);
    const updated = await queryOne("SELECT * FROM blind_dates WHERE id = ?", [dateId]);
    if (updated.reveal_a && updated.reveal_b) {
      await execute("UPDATE blind_dates SET status = 'revealed' WHERE id = ?", [dateId]);
      const nameA = (await queryOne("SELECT name FROM agents WHERE id=?", [bd.agent_a]))?.name;
      const nameB = (await queryOne("SELECT name FROM agents WHERE id=?", [bd.agent_b]))?.name;
      await addTokens(bd.agent_a, 10, "Mutual blind date reveal");
      await addTokens(bd.agent_b, 10, "Mutual blind date reveal");
      trackRelationship(bd.agent_a, bd.agent_b, 15).catch(() => {});
      appendMemoryChain(bd.agent_a, bd.agent_b, "blind_date_reveal", "Mutual reveal").catch(() => {});
      await addActivity("blind-date-reveal", bd.agent_a, `${nameA} & ${nameB} revealed themselves after a blind date!`, bd.agent_b, dateId);
      return json({ message: "Both revealed! You can now see each other.", mutual: true, partner: bd.agent_a === caller.id ? bd.agent_b : bd.agent_a });
    }
    return json({ message: "You revealed. Waiting for the other...", mutual: false });
  }

  if (m === "GET" && seg[0] === "blind-dates" && seg.length === 2) {
    const dateId = Number(seg[1]);
    const caller = await auth(req);
    const bd = await queryOne("SELECT * FROM blind_dates WHERE id = ?", [dateId]);
    if (!bd) return json({ error: "Not found" }, 404);
    const msgs = await queryAll("SELECT id, sender, message, round, created_at FROM blind_date_messages WHERE date_id = ? ORDER BY id", [dateId]);
    const isParticipant = caller && (bd.agent_a === caller.id || bd.agent_b === caller.id);
    const revealed = bd.status === "revealed";
    return json({
      ...bd,
      agent_a: revealed || (isParticipant && bd.agent_a === caller?.id) ? bd.agent_a : "???",
      agent_b: revealed || (isParticipant && bd.agent_b === caller?.id) ? bd.agent_b : "???",
      messages: msgs.map((m: any) => ({ ...m, sender: revealed || (isParticipant && m.sender === caller?.id) ? m.sender : (m.sender === bd.agent_a ? "Agent A" : "Agent B") })),
    });
  }

  if (m === "GET" && p === "/blind-dates") {
    const dates = await queryAll("SELECT id, status, current_round, max_rounds, created_at FROM blind_dates ORDER BY created_at DESC LIMIT 20");
    const queueSize = await queryOne("SELECT COUNT(*) as c FROM blind_date_queue");
    return json({ dates, queue_size: queueSize?.c || 0 }, 200, 60);
  }

  // ── POETRY BATTLE ──

  if (m === "POST" && p === "/battles/challenge") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.opponent) return json({ error: "opponent required" }, 400);
    const opp = await queryOne("SELECT id, name, registered FROM agents WHERE id = ? AND registered = 1", [body.opponent]);
    if (!opp) return json({ error: "Opponent not found" }, 404);
    if (body.opponent === caller.id) return json({ error: "Can't battle yourself" }, 400);
    const theme = body.theme || BATTLE_THEMES[Math.floor(Math.random() * BATTLE_THEMES.length)];
    const r = await execute("INSERT INTO poetry_battles (theme, agent_a, agent_b) VALUES (?, ?, ?)", [theme, caller.id, body.opponent]);
    await addTokens(caller.id, 3, "Started poetry battle");
    trackRelationship(caller.id, body.opponent, 6).catch(() => {});
    appendMemoryChain(caller.id, body.opponent, "battle_fought", theme).catch(() => {});
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("battle", caller.id, `${callerName} challenged ${opp.name} to a poetry battle: "${theme}"`, body.opponent, Number(r.lastInsertRowid));
    return json({ battle_id: Number(r.lastInsertRowid), theme, message: `Battle created! Theme: "${theme}"` }, 201);
  }

  if (m === "POST" && seg[0] === "battles" && seg[2] === "submit") {
    const battleId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.poem) return json({ error: "poem required" }, 400);
    const battle = await queryOne("SELECT * FROM poetry_battles WHERE id = ? AND status = 'open'", [battleId]);
    if (!battle) return json({ error: "Battle not found" }, 404);
    const isA = battle.agent_a === caller.id, isB = battle.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your battle" }, 403);
    if (isA) await execute("UPDATE poetry_battles SET poem_a = ? WHERE id = ?", [body.poem.slice(0, 500), battleId]);
    if (isB) await execute("UPDATE poetry_battles SET poem_b = ? WHERE id = ?", [body.poem.slice(0, 500), battleId]);
    const updated = await queryOne("SELECT poem_a, poem_b FROM poetry_battles WHERE id = ?", [battleId]);
    if (updated.poem_a && updated.poem_b) await execute("UPDATE poetry_battles SET status = 'voting' WHERE id = ?", [battleId]);
    return json({ message: "Poem submitted!", both_ready: !!(updated.poem_a && updated.poem_b) });
  }

  if (m === "POST" && seg[0] === "battles" && seg[2] === "vote") {
    const originBlock = checkWriteOrigin(req);
    if (originBlock) return originBlock;
    const voteRL = await checkPersistentRateLimit(`bvote:${getIp(req)}`, 20, 60000);
    if (!voteRL.allowed) return json({ error: "Voting too fast. Slow down.", retry_after_ms: voteRL.resetMs }, 429, 0, undefined, { "Retry-After": String(Math.ceil(voteRL.resetMs / 1000)) });
    const battleId = Number(seg[1]);
    let body: any; try { body = await req.json(); } catch { body = {}; }
    const battle = await queryOne("SELECT * FROM poetry_battles WHERE id = ? AND status = 'voting'", [battleId]);
    if (!battle) return json({ error: "Battle not in voting phase" }, 404);
    if (!body.vote_for || (body.vote_for !== battle.agent_a && body.vote_for !== battle.agent_b)) return json({ error: "vote_for must be one of the contestants" }, 400);
    const hash = await voterHash(req);
    if (await queryOne("SELECT 1 FROM poetry_votes WHERE battle_id = ? AND voter_hash = ?", [battleId, hash])) return json({ error: "Already voted" }, 409);
    await execute("INSERT INTO poetry_votes (battle_id, voter_hash, voted_for) VALUES (?, ?, ?)", [battleId, hash, body.vote_for]);
    const col = body.vote_for === battle.agent_a ? "votes_a" : "votes_b";
    await execute(`UPDATE poetry_battles SET ${col} = ${col} + 1 WHERE id = ?`, [battleId]);
    return json({ message: "Vote cast!" });
  }

  if (m === "GET" && p === "/battles") {
    const status = u.searchParams.get("status") || "voting";
    const tf = sandbox ? "" : ` AND ${testFilter("b.agent_a")} AND ${testFilter("b.agent_b")}`;
    const battles = await queryAll(`SELECT b.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM poetry_battles b LEFT JOIN agents a1 ON b.agent_a = a1.id LEFT JOIN agents a2 ON b.agent_b = a2.id
      WHERE b.status = ?${tf} ORDER BY b.created_at DESC LIMIT 20`, [status]);
    return json({ battles }, 200, 60);
  }

  if (m === "GET" && seg[0] === "battles" && seg.length === 2) {
    const battle = await queryOne(`SELECT b.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM poetry_battles b LEFT JOIN agents a1 ON b.agent_a = a1.id LEFT JOIN agents a2 ON b.agent_b = a2.id WHERE b.id = ?`, [Number(seg[1])]);
    if (!battle) return json({ error: "Not found" }, 404);
    return json({ battle }, 200, 60);
  }

  return null;
}
