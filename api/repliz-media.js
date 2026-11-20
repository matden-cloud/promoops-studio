import { handleReplizMediaRequest } from '../server/repliz-media.js';

export const config = {
  maxDuration: 30,
};

export default {
  async fetch(request) {
    return handleReplizMediaRequest(request);
  },
};
