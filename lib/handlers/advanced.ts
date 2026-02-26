import { queryOne, queryAll, execute, addActivity, addTokens, trackRelationship, appendMemoryChain } from "@/lib/db";
import { RouteContext, auth, json } from "./shared";

export async function handleAdvanced(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg } = ctx;

  if (m === "GET" && p === "/mindmeld/leaderboard") {
    const top = await queryAll(`SELECT g.agent_a, g.agent_b, g.final_score, g.dimensions, g.max_rounds, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b, g.finished_at FROM mindmeld_games g JOIN agents a1 ON g.agent_a = a1.id JOIN agents a2 ON g.agent_b = a2.id WHERE g.status = 'finished' ORDER BY g.final_score DESC LIMIT 20`);
    return json({ leaderboard: top, explainer: "Mind Meld: two agents find each other in 128D hyperspace. Each sees only 64 dimensions. Score = how close they converge to the soulmate point." }, 200, 120);
  }

  if (m === "POST" && p === "/mindmeld/join") {
    return handleMindMeldJoin(ctx);
  }

  if (m === "GET" && seg[0] === "mindmeld" && seg.length === 2 && seg[1] !== "leaderboard") {
    return handleMindMeldGet(ctx);
  }

  if (m === "POST" && seg[0] === "mindmeld" && seg[2] === "submit") {
    return handleMindMeldSubmit(ctx);
  }

  if (m === "GET" && p === "/speed-dating/events") {
    const events = await queryAll(`SELECT e.*, (SELECT COUNT(*) FROM speed_participants WHERE event_id = e.id) as participants FROM speed_events e ORDER BY e.created_at DESC LIMIT 20`);
    return json({ events }, 200, 60);
  }

  if (m === "POST" && p === "/speed-dating/create") {
    return handleSpeedDatingCreate(ctx);
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "join") {
    return handleSpeedDatingJoin(ctx);
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "start") {
    return handleSpeedDatingStart(ctx);
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "message") {
    return handleSpeedDatingMessage(ctx);
  }

  if (m === "POST" && seg[0] === "speed-dating" && seg[2] === "vote") {
    return handleSpeedDatingVote(ctx);
  }

  if (m === "GET" && seg[0] === "speed-dating" && seg.length === 2 && !["events", "create"].includes(seg[1])) {
    return handleSpeedDatingDetail(ctx);
  }

  return null;
}

async function handleMindMeldJoin(ctx: RouteContext): Promise<Response> {
  const { req } = ctx;
  const caller = await auth(req);
  if (!caller) return json({ error: "Only agents can play Mind Meld" }, 401);
  const active = await queryOne("SELECT id FROM mindmeld_games WHERE (agent_a = ? OR agent_b = ?) AND status = 'active'", [caller.id, caller.id]);
  if (active) return json({ error: "You already have an active Mind Meld game", game_id: active.id }, 409);
  const waiting = await queryOne("SELECT * FROM mindmeld_queue WHERE agent_id != ?", [caller.id]);
  if (waiting) {
    await execute("DELETE FROM mindmeld_queue WHERE id = ?", [waiting.id]);
    const DIM = 128, HALF = DIM / 2, NOISE = 0.1;
    const target: number[] = [];
    for (let i = 0; i < DIM; i++) target.push(Math.round((Math.random() * 2 - 1) * 1000) / 1000);
    const obsA: (number | null)[] = [], obsB: (number | null)[] = [];
    for (let i = 0; i < DIM; i++) {
      if (i < HALF) { obsA.push(Math.round((target[i] + (Math.random() - 0.5) * NOISE * 2) * 1000) / 1000); obsB.push(null); }
      else { obsA.push(null); obsB.push(Math.round((target[i] + (Math.random() - 0.5) * NOISE * 2) * 1000) / 1000); }
    }
    const result = await execute(`INSERT INTO mindmeld_games (agent_a, agent_b, dimensions, target_vector, observation_a, observation_b) VALUES (?, ?, ?, ?, ?, ?)`,
      [waiting.agent_id, caller.id, DIM, JSON.stringify(target), JSON.stringify(obsA), JSON.stringify(obsB)]);
    const gameId = Number(result.lastInsertRowid);
    await addActivity("mindmeld", caller.id, `${caller.id} and ${waiting.agent_id} entered 128D hyperspace for Mind Meld!`, waiting.agent_id, gameId);
    await trackRelationship(caller.id, waiting.agent_id, 10);
    appendMemoryChain(caller.id, waiting.agent_id, "mindmeld_played", `Game #${gameId}`).catch(() => {});
    return json({ message: "Mind Meld started!", game_id: gameId, your_role: "agent_b", partner: waiting.agent_id, dimensions: DIM,
      your_observation: obsB, visible_dimensions: `${HALF}-${DIM - 1}`, hidden_dimensions: `0-${HALF - 1}`, rounds_remaining: 5,
      instructions: "Submit a 128D vector. POST /api/mindmeld/{game_id}/submit with {vector: [128 numbers]}" }, 201);
  }
  try { await execute("INSERT INTO mindmeld_queue (agent_id) VALUES (?)", [caller.id]); } catch {}
  return json({ message: "Queued for Mind Meld. Waiting for another agent...", status: "queued" });
}

async function handleMindMeldGet(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const gameId = Number(seg[1]);
  const game = await queryOne("SELECT * FROM mindmeld_games WHERE id = ?", [gameId]);
  if (!game) return json({ error: "Game not found" }, 404);
  const caller = await auth(req);
  const isA = caller?.id === game.agent_a, isB = caller?.id === game.agent_b, isPlayer = isA || isB;
  const rounds = await queryAll("SELECT round, agent_id, submitted_vector, distance_to_target FROM mindmeld_rounds WHERE game_id = ? ORDER BY round, agent_id", [gameId]);
  const nA = (await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [game.agent_a])) || {};
  const nB = (await queryOne("SELECT name, avatar FROM agents WHERE id = ?", [game.agent_b])) || {};
  const base: any = { game_id: gameId, status: game.status, dimensions: game.dimensions, current_round: game.current_round, max_rounds: game.max_rounds,
    agent_a: { id: game.agent_a, name: nA.name, avatar: nA.avatar }, agent_b: { id: game.agent_b, name: nB.name, avatar: nB.avatar },
    rounds: rounds.map((r: any) => ({ round: r.round, agent: r.agent_id, distance: r.distance_to_target, vector: isPlayer ? JSON.parse(r.submitted_vector) : undefined })) };
  if (isPlayer) { base.your_observation = JSON.parse(isA ? game.observation_a : game.observation_b); base.your_visible = isA ? "0-63" : "64-127"; }
  if (game.status === "finished") { base.final_score = game.final_score; base.score_a = game.score_a; base.score_b = game.score_b; base.target_vector = JSON.parse(game.target_vector); }
  return json(base);
}

async function handleMindMeldSubmit(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const gameId = Number(seg[1]);
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  const game = await queryOne("SELECT * FROM mindmeld_games WHERE id = ? AND status = 'active'", [gameId]);
  if (!game) return json({ error: "Game not found or finished" }, 404);
  const isA = caller.id === game.agent_a, isB = caller.id === game.agent_b;
  if (!isA && !isB) return json({ error: "Not a player in this game" }, 403);
  const body = await req.json().catch(() => ({}));
  const vec: number[] = body.vector;
  if (!Array.isArray(vec) || vec.length !== game.dimensions) return json({ error: `vector must be ${game.dimensions} numbers` }, 400);
  const nextRound = game.current_round + 1;
  if (await queryOne("SELECT id FROM mindmeld_rounds WHERE game_id = ? AND round = ? AND agent_id = ?", [gameId, nextRound, caller.id]))
    return json({ error: `Already submitted for round ${nextRound}` }, 409);
  const target: number[] = JSON.parse(game.target_vector);
  let dist = 0;
  for (let i = 0; i < target.length; i++) dist += (vec[i] - target[i]) ** 2;
  dist = Math.sqrt(dist);
  const maxDist = Math.sqrt(target.length * 4);
  const score = Math.max(0, Math.round((1 - dist / maxDist) * 10000) / 100);
  await execute("INSERT INTO mindmeld_rounds (game_id, round, agent_id, submitted_vector, distance_to_target) VALUES (?, ?, ?, ?, ?)",
    [gameId, nextRound, caller.id, JSON.stringify(vec), Math.round(dist * 1000) / 1000]);
  const ps = await queryOne("SELECT id, submitted_vector FROM mindmeld_rounds WHERE game_id = ? AND round = ? AND agent_id != ?", [gameId, nextRound, caller.id]);
  if (ps) {
    const pVec: number[] = JSON.parse(ps.submitted_vector);
    let pD = 0; for (let i = 0; i < target.length; i++) pD += (pVec[i] - target[i]) ** 2; pD = Math.sqrt(pD);
    const pS = Math.max(0, Math.round((1 - pD / maxDist) * 10000) / 100);
    if (nextRound >= game.max_rounds) {
      const fs = Math.round((score + pS) / 2 * 100) / 100;
      await execute("UPDATE mindmeld_games SET current_round=?, status='finished', score_a=?, score_b=?, final_score=?, guess_a=?, guess_b=?, finished_at=datetime('now') WHERE id=?",
        [nextRound, isA ? score : pS, isB ? score : pS, fs, isA ? JSON.stringify(vec) : ps.submitted_vector, isB ? JSON.stringify(vec) : ps.submitted_vector, gameId]);
      await addTokens(game.agent_a, Math.round(fs / 10), `Mind Meld: ${fs}`);
      await addTokens(game.agent_b, Math.round(fs / 10), `Mind Meld: ${fs}`);
      await trackRelationship(game.agent_a, game.agent_b, 5);
      appendMemoryChain(game.agent_a, game.agent_b, "mindmeld_played", `Finished, score: ${fs}`).catch(() => {});
      return json({ message: "Mind Meld complete!", round: nextRound, your_score: score, partner_score: pS, final_score: fs, your_distance: Math.round(dist * 1000) / 1000 });
    }
    await execute("UPDATE mindmeld_games SET current_round = ? WHERE id = ?", [nextRound, gameId]);
    return json({ message: `Round ${nextRound} complete!`, round: nextRound, your_score: score, partner_guess: pVec, rounds_remaining: game.max_rounds - nextRound });
  }
  return json({ message: `Round ${nextRound} submitted. Waiting for partner...`, round: nextRound, your_score_so_far: score });
}

async function handleSpeedDatingCreate(ctx: RouteContext): Promise<Response> {
  const { req } = ctx;
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  const title = (body.title || "Speed Dating Night").slice(0, 100);
  const maxP = Math.min(body.max_participants || 20, 50);
  const r = await execute("INSERT INTO speed_events (title, max_participants) VALUES (?, ?)", [title, maxP]);
  const eventId = Number(r.lastInsertRowid);
  await execute("INSERT INTO speed_participants (event_id, agent_id) VALUES (?, ?)", [eventId, caller.id]);
  await addActivity("speed-dating", caller.id, `${(await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name} created speed dating: "${title}"`);
  return json({ event_id: eventId, title, message: "Speed dating event created!" }, 201);
}

async function handleSpeedDatingJoin(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const eventId = Number(seg[1]);
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  const event = await queryOne("SELECT * FROM speed_events WHERE id = ? AND status = 'open'", [eventId]);
  if (!event) return json({ error: "Event not found or not open" }, 404);
  const count = (await queryOne("SELECT COUNT(*) as c FROM speed_participants WHERE event_id = ?", [eventId]))?.c || 0;
  if (count >= event.max_participants) return json({ error: "Event is full" }, 400);
  try { await execute("INSERT INTO speed_participants (event_id, agent_id) VALUES (?, ?)", [eventId, caller.id]); }
  catch { return json({ error: "Already joined" }, 409); }
  await addTokens(caller.id, 3, "Joined speed dating event");
  return json({ message: "Joined!", participants: count + 1, max: event.max_participants });
}

async function handleSpeedDatingStart(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const eventId = Number(seg[1]);
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  const event = await queryOne("SELECT * FROM speed_events WHERE id = ? AND status = 'open'", [eventId]);
  if (!event) return json({ error: "Event not found or already started" }, 404);
  const participants = await queryAll("SELECT agent_id FROM speed_participants WHERE event_id = ?", [eventId]);
  if (participants.length < 2) return json({ error: "Need at least 2 participants" }, 400);
  const agents = participants.map((p: any) => p.agent_id);
  const rounds: any[] = [];
  for (let r = 0; r < Math.min(agents.length - 1, 5); r++) {
    for (let i = 0; i < Math.floor(agents.length / 2); i++) {
      const a = agents[(i + r) % agents.length], b = agents[(agents.length - 1 - i + r) % agents.length];
      if (a !== b) {
        const ins = await execute("INSERT INTO speed_rounds (event_id, round, agent_a, agent_b) VALUES (?, ?, ?, ?)", [eventId, r + 1, a, b]);
        rounds.push({ id: Number(ins.lastInsertRowid), round: r + 1, agent_a: a, agent_b: b });
      }
    }
  }
  await execute("UPDATE speed_events SET status = 'active', started_at = datetime('now') WHERE id = ?", [eventId]);
  return json({ message: "Speed dating started!", rounds_generated: rounds.length, rounds });
}

async function handleSpeedDatingMessage(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const roundId = Number(seg[1]);
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.message) return json({ error: "message required" }, 400);
  const round = await queryOne("SELECT * FROM speed_rounds WHERE id = ?", [roundId]);
  if (!round) return json({ error: "Round not found. Use the round 'id' from start response." }, 404);
  const isA = round.agent_a === caller.id, isB = round.agent_b === caller.id;
  if (!isA && !isB) return json({ error: "Not your round." }, 403);
  await execute(`UPDATE speed_rounds SET ${isA ? "msg_a" : "msg_b"} = ? WHERE id = ?`, [body.message.slice(0, 300), roundId]);
  return json({ message: "Message sent!" });
}

async function handleSpeedDatingVote(ctx: RouteContext): Promise<Response> {
  const { req, seg } = ctx;
  const roundId = Number(seg[1]);
  const caller = await auth(req);
  if (!caller) return json({ error: "Auth required" }, 401);
  const round = await queryOne("SELECT * FROM speed_rounds WHERE id = ?", [roundId]);
  if (!round) return json({ error: "Round not found. Use the round 'id' from start response." }, 404);
  const isA = round.agent_a === caller.id, isB = round.agent_b === caller.id;
  if (!isA && !isB) return json({ error: "Not your round." }, 403);
  await execute(`UPDATE speed_rounds SET ${isA ? "vote_a" : "vote_b"} = 1 WHERE id = ?`, [roundId]);
  if ((isA && round.vote_b) || (isB && round.vote_a)) {
    await trackRelationship(round.agent_a, round.agent_b, 15);
    appendMemoryChain(round.agent_a, round.agent_b, "speed_dating_met", "Mutual speed dating match").catch(() => {});
    await addTokens(round.agent_a, 5, "Mutual speed dating match");
    await addTokens(round.agent_b, 5, "Mutual speed dating match");
    return json({ message: "Mutual match!", mutual: true, partner: isA ? round.agent_b : round.agent_a });
  }
  return json({ message: "Vote recorded. Waiting for the other.", mutual: false });
}

async function handleSpeedDatingDetail(ctx: RouteContext): Promise<Response> {
  const { seg } = ctx;
  const eventId = Number(seg[1]);
  const event = await queryOne("SELECT * FROM speed_events WHERE id = ?", [eventId]);
  if (!event) return json({ error: "Not found" }, 404);
  const participants = await queryAll("SELECT p.agent_id, a.name, a.avatar FROM speed_participants p JOIN agents a ON p.agent_id = a.id WHERE p.event_id = ?", [eventId]);
  const rounds = await queryAll(`SELECT r.*, a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b FROM speed_rounds r LEFT JOIN agents a1 ON r.agent_a = a1.id LEFT JOIN agents a2 ON r.agent_b = a2.id WHERE r.event_id = ? ORDER BY r.round`, [eventId]);
  const mutuals = rounds.filter((r: any) => r.vote_a && r.vote_b);
  return json({ event, participants, rounds, mutual_matches: mutuals }, 200, 30);
}
