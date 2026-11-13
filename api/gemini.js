import { handleGeminiRequest } from '../server/gemini.js';

export const config = {
  maxDuration: 30,
};

export default {
  async fetch(request) {
    return handleGeminiRequest(request);
  },
};
