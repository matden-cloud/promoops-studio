import { handleVoiceRequest } from '../server/voice.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleVoiceRequest(request);
  },
};
