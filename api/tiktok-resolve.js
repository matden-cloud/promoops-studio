import { handleTikTokResolveRequest } from '../server/tiktok.js';

export const config = {
  maxDuration: 15,
};

export default {
  async fetch(request) {
    return handleTikTokResolveRequest(request);
  },
};
