import { handleVoiceRoute } from '../server/voice-route.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleVoiceRoute(request);
  },
};
