// index.ts
//
// The ONE deployment entry point for the Safai Saathi backend.
//
// There are 22 functions here. Fifteen are callables, the client asks for
// them by name. Seven are server functions, they run on their own.
//
// The export name IS the Firebase function name. `exports.startShift` in the
// source becomes the callable `startShift` on the client. A rename here is a
// rename on three phones, so it is a contract change.
//
// The old PIN flow is gone. CHG-0006 deleted verifyDriverPin, setDriverPin and
// the vanSecrets collection. The badge code was printed on the van, it was
// never a credential.
//
// Every module imports `db`, `auth` and `messaging` from `lib/firebase.ts`.
// That file is the only place the Admin SDK is initialised.

// --- the callables ----------------------------------------------------------
//
// The client calls these by name. The contract for each one, its input, its
// output and the reason codes it may return, is in 02-contracts/callables.json
// under x-callables.

export { bindDeviceToVan, bootstrapUserSession, mintStaffToken } from './callables/identity';
export { startShift, endShift, markWardDone } from './callables/shift';
export {
  setComplaintStatus,
  publishNotice,
  upsertDriver,
  upsertStaff,
  setVanDepot,
} from './callables/admin';
export { citizenVerifyResolution, reopenComplaint } from './callables/complaints';
export { getWardDutyStatus, markWardDutyCompleted } from './callables/wardDuty';

// --- the server functions ----------------------------------------------------
//
// These run on their own. They do not answer a client. They exist because a
// decision needs a live document, and no client can be trusted to make it.
//
// The arrival alert fires when a van reaches a ward boundary. The duplicate
// merge fires when two complaints land on the same spot. The four sweeps run
// on a schedule. The WhatsApp webhook is the one endpoint the internet can
// reach, and it verifies the provider's signature before it writes anything.

export { arrivalAlert } from './triggers/arrivalAlert';
export { mergeDuplicates } from './triggers/mergeDuplicates';
export { missedCollectionAlert } from './scheduled/missedCollectionAlert';
export { escalateComplaints } from './scheduled/escalateComplaints';
export { autoResolvePendingComplaints } from './scheduled/autoResolvePendingComplaints';
export { vanOfflineWatch } from './scheduled/vanOfflineWatch';
export { whatsappWebhook } from './webhooks/whatsappWebhook';
