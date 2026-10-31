# lib/pairing_probe.js

- PairingProbeError · class · L8-L15 — class PairingProbeError extends Error
- constructor · method · L10-L14 — constructor(code)
- isValidHost · function · L17-L39 — function isValidHost(host)
- validateHost · function · L41-L50 — function validateHost(host)
- validatePort · function · L52-L61 — function validatePort(port)
- testTcp · function · L63-L114 — function testTcp(host, port, acceptRefused)
- complete · function · L70-L89 — complete = (error = null)
- testArp · function · L116-L146 — async function testArp(homey, host)
- testIpDevice · function · L148-L158 — async function testIpDevice(homey, host)
- testTcpService · function · L160-L166 — async function testTcpService(host, port)
- getProbeErrorMessage · function · L168-L181 — function getProbeErrorMessage(homey, error)
- isPairingValidationError · function · L183-L186 — function isPairingValidationError(error)
