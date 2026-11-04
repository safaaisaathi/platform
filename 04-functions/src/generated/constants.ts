// GENERATED FILE. DO NOT EDIT.
// Source: 02-contracts/constants.json in the platform repo (contract version 2.1.0).
// Regenerate with: node 08-tools/export-ts-constants.ts <path to this repo>

// Every number and string that must match on both sides of a boundary.

// tracking: The location engine's cadence and thresholds.

/** The normal location write cadence. The arrival alert sees one write per this interval. (seconds) */
export const GPS_INTERVAL_SEC = 10;

/** The cadence below LOW_BATTERY_PCT. (seconds) */
export const GPS_INTERVAL_LOW_BATTERY_SEC = 30;

/** Below this, the slow cadence applies. (percent) */
export const LOW_BATTERY_PCT = 20;

/** The movement threshold below which a location write is skipped. (metres) */
export const MIN_MOVE_M = 15;

/** The write policy's heartbeat. Forces a write even if the van has not moved. (seconds) */
export const HEARTBEAT_SEC = 30;

// arrival: The arrival alert's geometry and freshness.

/** How close the van must be to the ward boundary before the citizen is alerted. PRD-2 section 0.6 says 500. The office asked for 100. The measured distance is from the ward BOUNDARY, not the centre, so the check is 'distance(centre) <= radiusM + ARRIVAL_ALERT_RADIUS_M'. (metres) */
export const ARRIVAL_ALERT_RADIUS_M = 100;

/** A location older than this is not trusted. The server uses it to decide whether to alert. The device uses it to decide whether to show 'last seen X min ago'. (seconds) */
export const STALE_LOCATION_SEC = 60;

/** A van with no location write for this long is marked offline. (minutes) */
export const OFFLINE_THRESHOLD_MIN = 10;

// duplicates: The complaint merge radius.

/** Two complaints closer than this are candidates for merging. (metres) */
export const DUPLICATE_RADIUS_M = 50;

// escalation: The complaint escalation clock.

/** An unresolved complaint escalates to level 1 after this. (hours) */
export const ESCALATION_L1_HOURS = 24;

/** An unresolved complaint escalates to level 2 after this. (hours) */
export const ESCALATION_L2_HOURS = 48;

/** This many missed-collection reports in one ward today triggers the inspector alert. (reports) */
export const MISSED_REPORT_THRESHOLD = 3;

// complaints: The complaint rate limit.

/** The rate limit per device per IST day. (complaints) */
export const MAX_COMPLAINTS_PER_DEVICE_PER_DAY = 5;

// depot: The depot dwell auto-end rule.

/** The depot zone radius. (metres) */
export const DEPOT_RADIUS_M = 500;

/** Continuous dwell inside DEPOT_RADIUS_M that auto-ends the shift. (hours) */
export const DEPOT_DWELL_LIMIT_HOURS = 3;

/** Moving this far outside the depot restarts the dwell clock. (metres) */
export const DEPOT_DWELL_RESET_M = 100;

// eta: The ETA fallback speed.

/** The fallback speed for the straight-line ETA estimate. (km/h) */
export const AVG_VAN_SPEED_KMPH = 15;

// identity: Claim names, formats and reason codes. A mismatch here is a security bug or a broken message.

/** The claim name for the van the session is bound to. */
export const CLAIM_VAN_ID = "vanId";

/** The claim name for the driver's badge code. This is the phone-number wall. */
export const CLAIM_DRIVER_ID = "driverId";

/** The claim name for the citizen's install id. Q6. */
export const CLAIM_DEVICE_ID = "deviceId";

/** The claim name for the route the citizen's ward belongs to. */
export const CLAIM_ROUTE_ID = "routeId";

/** The claim name for the open trip. Lets a rule be a pure token check. */
export const CLAIM_CURRENT_TRIP_ID = "currentTripId";

/** The claim name for the staff member's doc id. */
export const CLAIM_STAFF_ID = "staffId";

/** The claim name for the staff member's ward scope. The claim NAME is a string. The claim's VALUE is an array of ward ids. Every other CLAIM_ constant has a string value, so this one carries an explicit claimValueType. */
export const CLAIM_WARD_IDS = "wardIds";

/** The claim name for the staff role. */
export const CLAIM_ROLE = "role";

/** The exact masked phone shape. A different length breaks the confirm card's layout. */
export const PHONE_MASK_FORMAT = "98XXXXXX10";

/** The driver doc id format. The callable rejects what the admin panel normalizes. */
export const DRIVER_CODE_PATTERN = "^[A-Z]{2}-[0-9]{4}$";

/** The human complaint id format. */
export const TICKET_ID_PATTERN = "^PMH-[0-9]{8}-[0-9]{4}$";

// binding: The device-claim rate limit and the claim modes.

/** Reason code: the van is on shift with another driver. Q2. */
export const SHIFT_CONFLICT_VAN_HELD = "vanHeldByAnotherDriver";

/** Reason code: another phone already holds the binding. Q1 and Q2. */
export const SHIFT_CONFLICT_ALREADY_CLAIMED = "vanAlreadyClaimed";

/** Reason code: vans.currentTripId points at a trip of a different van. Q2. */
export const SHIFT_CONFLICT_STALE_MARKER = "staleMarker";

/** The device-claim oracle guard. (attempts) */
export const BIND_RATE_LIMIT_MAX = 5;

/** The window for BIND_RATE_LIMIT_MAX. (minutes) */
export const BIND_RATE_LIMIT_WINDOW_MIN = 10;

/** Q1. The binding was created by the first phone with a valid code. */
export const VAN_DEVICE_CLAIM_MODE_FIRST = "firstClaim";

/** Phase 11 hardening. The office had already written the binding. */
export const VAN_DEVICE_CLAIM_MODE_PREPROVISIONED = "preProvisioned";

