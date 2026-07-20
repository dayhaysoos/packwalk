import { makeSessionEventServer } from "../adapters/local-session-ipc.js"

/**
 * Claims only the local client transport after storage writer election. Once
 * storage acquisition succeeds, any bind failure is transport-unavailable: an
 * accepting listener cannot prove that a healthy PackWalk daemon exists.
 */
export const claimSessionDaemonEndpoint = (
  endpoint: string,
) => makeSessionEventServer(endpoint)
