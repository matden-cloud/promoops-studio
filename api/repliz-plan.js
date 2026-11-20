import { handleReplizPlanRequest } from '../server/repliz-plan.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleReplizPlanRequest(request);
  },
};
