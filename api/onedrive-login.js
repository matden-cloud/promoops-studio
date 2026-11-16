import { handleOneDriveLoginRequest } from '../server/onedrive.js';

export const config = {
  maxDuration: 30,
};

export default {
  async fetch(request) {
    return handleOneDriveLoginRequest(request);
  },
};
