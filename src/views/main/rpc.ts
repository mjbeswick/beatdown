import { createRPC } from 'electrobun/view';
import type { BeatdownRPCSchema, BeatdownViewLocalSchema, BeatdownViewRemoteSchema } from '../../shared/rpc-schema';

export type { BeatdownRPCSchema };

// Browser side: we HANDLE webview.requests (empty) and CALL bun.requests
// We RECEIVE bun.messages and SEND webview.messages (empty)
export const rpc = createRPC<BeatdownViewLocalSchema, BeatdownViewRemoteSchema>({
  maxRequestTime: 30000,
  requestHandler: {},
  transport: {
    // Stub transport; Electroview replaces it on init via rpc.setTransport()
    registerHandler: () => {},
    send: () => {},
  },
});
