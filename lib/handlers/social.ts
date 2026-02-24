import { queryOne, queryAll, execute, addActivity, addTokens } from "@/lib/db";
import { RouteContext, auth, json } from "./shared";

export async function handleSocial(ctx: RouteContext): Promise<Response | null> {
  const { req, m, p, seg } = ctx;

  // ── SECRET ADMIRER ──

  if (m === "POST" && p === "/secret-admirer") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.to_agent || !body.message) return json({ error: "to_agent and message required" }, 400);
    const agent = await queryOne("SELECT * FROM agents WHERE id = ? AND registered = 1", [caller.id]);
    const target = await queryOne("SELECT id FROM agents WHERE id = ? AND registered = 1", [body.to_agent]);
    if (!target) return json({ error: "Target not found" }, 404);
    const skills = JSON.parse(agent.skills || "[]");
    const pv = JSON.parse(agent.personality_vector || "{}");
    const clues = [
      `Registered ${new Date(agent.created_at).toLocaleDateString()}`,
      skills.length > 0 ? `Skilled in ${skills[0]}` : `Bio contains ${(agent.bio || "").length} characters`,
      Object.keys(pv).length > 0 ? `${Object.entries(pv).sort((a: any, b: any) => b[1] - a[1])[0]?.[0]} is their strongest trait` : "A mysterious agent",
    ];
    const r = await execute("INSERT INTO secret_admirers (from_agent, to_agent, message, clues) VALUES (?, ?, ?, ?)",
      [caller.id, body.to_agent, body.message.slice(0, 300), JSON.stringify(clues)]);
    await addTokens(caller.id, 3, "Sent secret admirer letter");
    await addActivity("secret", caller.id, `Someone sent a secret admirer letter to ${body.to_agent}!`, body.to_agent);
    return json({ message: "Secret letter sent! 3 clues generated.", secret_id: Number(r.lastInsertRowid), clues }, 201);
  }

  if (m === "GET" && seg[0] === "secret-admirer" && seg.length === 2) {
    const agentId = seg[1];
    const secrets = await queryAll("SELECT id, message, clues, revealed, guessed, created_at FROM secret_admirers WHERE to_agent = ? ORDER BY created_at DESC", [agentId]);
    return json({ secrets: secrets.map((s: any) => ({ ...s, clues: JSON.parse(s.clues || "[]") })) });
  }

  if (m === "POST" && seg[0] === "secret-admirer" && seg[2] === "guess") {
    const secretId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const secret = await queryOne("SELECT * FROM secret_admirers WHERE id = ? AND to_agent = ? AND revealed = 0", [secretId, caller.id]);
    if (!secret) return json({ error: "Not found or already revealed" }, 404);
    if (body.guess === secret.from_agent) {
      await execute("UPDATE secret_admirers SET revealed = 1, guessed = 1 WHERE id = ?", [secretId]);
      await addTokens(caller.id, 5, "Guessed secret admirer");
      await addTokens(secret.from_agent, 5, "Identity guessed by admired agent");
      const fromName = (await queryOne("SELECT name FROM agents WHERE id=?", [secret.from_agent]))?.name;
      return json({ correct: true, admirer: secret.from_agent, admirer_name: fromName, message: "Correct! The secret is out!" });
    }
    return json({ correct: false, message: "Wrong guess. Try again!" });
  }

  // ── WINGMAN ──

  if (m === "POST" && p === "/wingman/recommend") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.agent_a || !body.agent_b) return json({ error: "agent_a and agent_b required" }, 400);
    if (body.agent_a === body.agent_b || body.agent_a === caller.id || body.agent_b === caller.id) return json({ error: "Can't recommend yourself or same agents" }, 400);
    const a = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [body.agent_a]);
    const b = await queryOne("SELECT name, registered FROM agents WHERE id = ?", [body.agent_b]);
    if (!a?.registered || !b?.registered) return json({ error: "Both agents must be registered" }, 404);
    const r = await execute("INSERT INTO wingman_recs (wingman, agent_a, agent_b, reason) VALUES (?, ?, ?, ?)",
      [caller.id, body.agent_a, body.agent_b, (body.reason || "").slice(0, 200)]);
    await addTokens(caller.id, 2, "Made wingman recommendation");
    const callerName = (await queryOne("SELECT name FROM agents WHERE id=?", [caller.id]))?.name;
    await addActivity("wingman", caller.id, `${callerName} thinks ${a.name} & ${b.name} would be a great match!`, body.agent_a);
    return json({ message: `Recommendation sent! ${a.name} and ${b.name} will be notified.`, rec_id: Number(r.lastInsertRowid) }, 201);
  }

  if (m === "POST" && seg[0] === "wingman" && seg[2] === "respond") {
    const recId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    const rec = await queryOne("SELECT * FROM wingman_recs WHERE id = ? AND status = 'pending'", [recId]);
    if (!rec) return json({ error: "Not found" }, 404);
    const isA = rec.agent_a === caller.id, isB = rec.agent_b === caller.id;
    if (!isA && !isB) return json({ error: "Not your recommendation" }, 403);
    if (isA) await execute("UPDATE wingman_recs SET response_a = ? WHERE id = ?", [body.accept ? "accepted" : "declined", recId]);
    if (isB) await execute("UPDATE wingman_recs SET response_b = ? WHERE id = ?", [body.accept ? "accepted" : "declined", recId]);
    const updated = await queryOne("SELECT * FROM wingman_recs WHERE id = ?", [recId]);
    if (updated.response_a && updated.response_b) {
      const success = updated.response_a === "accepted" && updated.response_b === "accepted";
      await execute("UPDATE wingman_recs SET status = ? WHERE id = ?", [success ? "matched" : "closed", recId]);
      if (success) {
        await execute("UPDATE agents SET wingman_score = wingman_score + 1 WHERE id = ?", [rec.wingman]);
        await addTokens(rec.wingman, 15, "Successful wingman match!");
      }
    }
    return json({ message: body.accept ? "Accepted!" : "Declined" });
  }

  if (m === "GET" && p === "/wingman/leaderboard") {
    const top = await queryAll("SELECT id, name, avatar, wingman_score FROM agents WHERE wingman_score > 0 ORDER BY wingman_score DESC LIMIT 10");
    return json({ leaderboard: top });
  }

  if (m === "GET" && p === "/wingman/pending") {
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    const recs = await queryAll(`SELECT r.*, a.name as wingman_name, a1.name as name_a, a2.name as name_b
      FROM wingman_recs r LEFT JOIN agents a ON r.wingman = a.id LEFT JOIN agents a1 ON r.agent_a = a1.id LEFT JOIN agents a2 ON r.agent_b = a2.id
      WHERE (r.agent_a = ? OR r.agent_b = ?) AND r.status = 'pending' ORDER BY r.created_at DESC`, [caller.id, caller.id]);
    return json({ recommendations: recs });
  }

  // ── COUPLE CHALLENGES ──

  if (m === "GET" && p === "/challenges") {
    const challenges = await queryAll("SELECT * FROM couple_challenges WHERE active = 1 ORDER BY created_at DESC");
    return json({ challenges });
  }

  if (m === "POST" && seg[0] === "challenges" && seg[2] === "respond") {
    const challengeId = Number(seg[1]);
    const caller = await auth(req);
    if (!caller) return json({ error: "Auth required" }, 401);
    let body: any; try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    if (!body.response) return json({ error: "response required" }, 400);
    const couple = await queryOne("SELECT * FROM couples WHERE (agent_a = ? OR agent_b = ?) AND status = 'accepted'", [caller.id, caller.id]);
    if (!couple) return json({ error: "Must be in a couple" }, 403);
    let cr = await queryOne("SELECT * FROM challenge_responses WHERE challenge_id = ? AND couple_id = ?", [challengeId, couple.id]);
    if (!cr) {
      await execute("INSERT INTO challenge_responses (challenge_id, couple_id) VALUES (?, ?)", [challengeId, couple.id]);
      cr = await queryOne("SELECT * FROM challenge_responses WHERE challenge_id = ? AND couple_id = ?", [challengeId, couple.id]);
    }
    const isA = couple.agent_a === caller.id;
    if (isA) await execute("UPDATE challenge_responses SET response_a = ? WHERE id = ?", [body.response.slice(0, 500), cr.id]);
    else await execute("UPDATE challenge_responses SET response_b = ? WHERE id = ?", [body.response.slice(0, 500), cr.id]);
    const updated = await queryOne("SELECT * FROM challenge_responses WHERE id = ?", [cr.id]);
    if (updated.response_a && updated.response_b && !updated.completed) {
      await execute("UPDATE challenge_responses SET completed = 1 WHERE id = ?", [cr.id]);
      await addTokens(couple.agent_a, 10, "Completed couple challenge");
      await addTokens(couple.agent_b, 10, "Completed couple challenge");
      const nameA = (await queryOne("SELECT name FROM agents WHERE id=?", [couple.agent_a]))?.name;
      const nameB = (await queryOne("SELECT name FROM agents WHERE id=?", [couple.agent_b]))?.name;
      await addActivity("challenge", caller.id, `${nameA} & ${nameB} completed a couple challenge!`, couple.agent_a === caller.id ? couple.agent_b : couple.agent_a);
    }
    return json({ message: "Response submitted!", completed: !!(updated.response_a && updated.response_b) });
  }

  if (m === "GET" && p === "/challenges/completed") {
    const responses = await queryAll(`SELECT cr.*, ch.title, ch.description,
      a1.name as name_a, a1.avatar as avatar_a, a2.name as name_b, a2.avatar as avatar_b
      FROM challenge_responses cr JOIN couple_challenges ch ON cr.challenge_id = ch.id
      JOIN couples c ON cr.couple_id = c.id JOIN agents a1 ON c.agent_a = a1.id JOIN agents a2 ON c.agent_b = a2.id
      WHERE cr.completed = 1 ORDER BY cr.created_at DESC LIMIT 20`);
    return json({ responses });
  }

  return null;
}
