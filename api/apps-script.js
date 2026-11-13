import { handleAppsScriptRequest } from '../server/apps-script.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleAppsScriptRequest(request);
  },
};
