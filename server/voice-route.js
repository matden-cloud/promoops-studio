import { handleFishRequest } from './fish.js';
import { handleInworldRequest } from './inworld.js';
import { handleVoiceRequest } from './voice.js';

export function voiceEngine(request) {
  return new URL(request.url).searchParams.get('engine') || 'gemini';
}

export async function handleVoiceRoute(request, deps = {}) {
  const engine = voiceEngine(request);
  if (engine === 'fish') return handleFishRequest(request, deps);
  if (engine === 'inworld') return handleInworldRequest(request, deps);
  return handleVoiceRequest(request, deps);
}
