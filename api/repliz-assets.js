import { handleReplizAssetsRequest } from '../server/repliz-assets.js';

export const config = {
  maxDuration: 30,
};

export default {
  async fetch(request) {
    return handleReplizAssetsRequest(request);
  },
};
