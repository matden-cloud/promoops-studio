import { handleReplizAccountsRequest } from '../server/repliz.js';

export const config = {
  maxDuration: 15,
};

export default {
  async fetch(request) {
    return handleReplizAccountsRequest(request);
  },
};
