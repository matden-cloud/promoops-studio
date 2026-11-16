import { handleOneDriveSyncRequest } from '../server/onedrive.js';

export const config = {
  maxDuration: 60,
};

export default {
  async fetch(request) {
    return handleOneDriveSyncRequest(request);
  },
};
