import { createRPC } from 'electrobun/view';
import type { ReelRPCSchema, ReelViewLocalSchema, ReelViewRemoteSchema } from '../../shared/rpc-schema';

export type { ReelRPCSchema };

// Browser side: we HANDLE webview.requests (empty) and CALL bun.requests
// We RECEIVE bun.messages and SEND webview.messages (empty)
export const rpc = createRPC<ReelViewLocalSchema, ReelViewRemoteSchema>({
  requestHandler: {},
  transport: {
    // Stub transport; Electroview replaces it on init via rpc.setTransport()
    registerHandler: () => {},
    send: () => {},
  },
});
