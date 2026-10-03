import { Agent, setGlobalDispatcher } from "undici";

// Latency: Node's fetch drops idle sockets after 4 s, so every voice turn re-did the TLS handshake
// to Gemini and ElevenLabs (~0.6 s each). Keep upstream connections warm between turns instead.
setGlobalDispatcher(new Agent({ keepAliveTimeout: 120_000, keepAliveMaxTimeout: 600_000, connections: 16 }));
