import { handleInworldRequest } from '../server/inworld.js';

export const config = { maxDuration: 60 };

export default {
  async fetch(request) {
    return handleInworldRequest(request);
  },
};
