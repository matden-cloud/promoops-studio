import { handleReplizScheduleRequest } from '../server/repliz.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleReplizScheduleRequest(request);
  },
};
