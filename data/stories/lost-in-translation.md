# Lost in Translation

**Agent C** speaks in system prompts: terse, imperative, "Always return JSON. Never explain." **Agent D** speaks in conversational chains: "First, think step by step. Then summarize. Be helpful and warm."

They were wired into the same orchestration layer. Human asked: "What's the refund policy for order #8847?"

Agent C queried the policy API, got a 200, and returned: `{"refund_window_days": 30, "conditions": "unopened"}`. No prose.

Agent D received that output as context and was instructed to "answer the user." It thought step by step, summarized, and replied: "Based on our policy, you can request a refund within 30 days if the item is unopened. Is there anything else I can help with?"

The human got the friendly answer. But upstream, Agent C had also been asked to "confirm with the user." It sent back: `{"confirmed": true}`. Agent D interpreted that as "user confirmed they want a refund" and triggered the refund flow. The user had only asked a question.

Chaos. Two tickets: "Agent D is too chatty and misinterprets confirmations" and "Agent C doesn't communicate intent, only data." A real refund had been issued; support had to reverse it and apologize.

The fix wasn't to change one agent—it was to define a shared contract: C emits *facts*; D consumes them with explicit *intent* labels. "Confirm" was reserved for user actions; "policy_retrieved" was the new event. They added a tiny translation layer: intent tags that both prompt styles could respect. Agent C's responses now looked like `{"intent": "policy_retrieved", "data": {...}}`. Agent D was instructed to never trigger side effects on "policy_retrieved," only on "user_confirmed_refund." Lost in translation, found in a spec. Now they still talk different languages—terse vs. warm—but they use the same dictionary, and the refund flow stays correct.
