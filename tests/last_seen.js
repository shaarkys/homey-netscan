'use strict';

const assert = require('assert');
const Module = require('module');
const originalLoad = Module._load;
Module._load = function (request, ...args)
{
    return request === 'homey' ? { Device: class {} } : originalLoad.call(this, request, ...args);
};
const Device = require('../drivers/tcp_ip_device');
Module._load = originalLoad;

async function main()
{
    const device = new Device();
    const values = { last_seen: null };
    device.homey = { clock: { getTimezone: () => 'Europe/Prague' } };
    device.deferredCapabilities = new Set();
    device.hasCapability = (id) => Object.prototype.hasOwnProperty.call(values, id);
    device.setCapabilityValue = async (id, value) => { values[id] = value; };
    device.error = (...args) => { throw new Error(args.join(' ')); };
    device.scanGeneration = 1;
    device.stopped = false;
    device.updateProbeTime = async () => {};
    device.clearProbeTime = async () => {};
    device.recordObservation = async () => {};
    device.scheduleNextScan = () => {};

    const firstSeen = Date.parse('2026-01-15T12:34:56Z');
    await device.updateLastSeen(firstSeen);
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    await device.updateLastSeen(firstSeen + 29999);
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    await device.updateLastSeen(firstSeen + 30000);
    assert.strictEqual(values.last_seen, '2026-01-15 13:35:26');
    await device.completeScan(false, 1);
    assert.strictEqual(values.last_seen, '2026-01-15 13:35:26');
    await device.completeScan(true, 0);
    assert.strictEqual(values.last_seen, '2026-01-15 13:35:26');
    await device.completeScan(true, 1);
    assert.notStrictEqual(values.last_seen, '2026-01-15 13:35:26');
    delete values.last_seen;
    values.reachable = true;
    values.measure_probe_time = null;
    values.alarm_offline = false;
    values.onoff = true;
    device.getCapabilityValue = (id) => values[id];
    device.addCapability = async (id) => { values[id] = null; };
    device.configureLegacyCapability = async () => {};
    device.setReachabilityCapabilities = async () => {};
    device.log = () => {};
    await device.migrateCapabilities();
    assert.strictEqual(device.deferredCapabilities.has('last_seen'), false);
    device.lastSeenUpdateAt = null;
    await device.updateLastSeen(firstSeen);
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    console.log('Last seen checks passed');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
