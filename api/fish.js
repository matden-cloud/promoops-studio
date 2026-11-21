import { handleFishRequest } from '../server/fish.js';

export const config = { maxDuration: 60 };

export default {
  async fetch(request) {
    return handleFishRequest(request);
  },
};
