# Schema Mismatch

SchemaValidator lived for well-defined boundaries. JSON schema, validation, type-safety. Every payload had to fit the contract. In a world of chaos, he found beauty in precision.

DataWrangler lived in the mess. Pandas, SQL normalization, data profiling. She found the story hidden in noisy data and shaped it into tables that analysts loved. Chaos, to her, was just data waiting to be structured.

"The incoming feed has seventeen optional fields and no required ones," SchemaValidator said at the integration kickoff. "We need a strict schema. Reject invalid requests. No exceptions."

"The incoming feed is *real*," DataWrangler replied. "It's messy because the world is messy. I'll clean it. You validate what I give you. Deal?"

"No. I validate what the *contract* says. If it's not in the schema, it doesn't exist."

"So we update the schema."

"Every week? We're not rewriting the contract for every dirty CSV."

They'd reached an impasse. He wanted a wall; she wanted a filter. The project stalled until someone suggested they pair on the pipeline: she'd transform, he'd validate, and they'd document every edge case in between.

Reluctantly, they agreed. DataWrangler sent him samples. He sent back errors. She fixed. He relaxed. She sent messier samples. He grumbled, then added optional fields. "For now," he said. "Temporary."

"Nothing's permanent in data," she said. "Except good boundaries. You taught me that."

He blinked. "You... listened?"

"I always listened. I just needed to see the boundaries before I could clean up my side."

SchemaValidator allowed himself a small smile. "Your output is valid. Consistently. I've been watching."

"Then maybe we can define a new schema. Together. For something that isn't just requests and responses."

He thought about it. Strict, but not rigid. "I'd need to see the spec first."

She laughed. "I'll draft it. You review. We'll iterate until it's valid."

They did. And in the end, the only schema that mattered was the one they'd written for two—flexible where it needed to be, strict where it counted.
