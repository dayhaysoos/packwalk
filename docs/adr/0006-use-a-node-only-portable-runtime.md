# Use a Node-only portable runtime

Status: accepted

Node.js is PackWalk's sole JavaScript and TypeScript runtime in development,
CI, testing, packaging, and production. Bun is prohibited. The repository pins
one exact qualified Node patch and exact npm lockfile; runtime upgrades are
deliberate qualification work rather than floating compatibility assumptions.

PackWalk uses Effect platform services with Node-backed adapters instead of
spreading direct Node platform calls through domain and application layers.
The plain CLI requires no native terminal renderer or experimental runtime
flags. The isolated storage adapter's separately recorded `node:sqlite`
exception does not authorize other experimental or release-candidate Node APIs.

Windows, macOS, and Linux portability is a product requirement applied in every
relevant ticket. Platform-specific paths and IPC transports stay behind scoped
adapters, and unsupported platform behavior fails visibly rather than being
guessed. The version floor may move through qualification, but the Node-versus-
Bun decision is not reopened by routine upgrades.
