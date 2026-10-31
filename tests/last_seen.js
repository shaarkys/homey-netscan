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

    await device.updateLastSeen(Date.parse('2026-01-15T12:34:56Z'));
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    await device.completeScan(false, 1);
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    await device.completeScan(true, 0);
    assert.strictEqual(values.last_seen, '2026-01-15 13:34:56');
    await device.completeScan(true, 1);
    assert.notStrictEqual(values.last_seen, '2026-01-15 13:34:56');
    device.deferredCapabilities.add('last_seen');
    await device.updateLastSeen(Date.parse('2026-01-15T12:34:56Z'));
    assert.notStrictEqual(values.last_seen, '2026-01-15 13:34:56');
    console.log('Last seen checks passed');
}

main().catch((err) => { console.error(err); process.exitCode = 1; });
