'use strict';

const net = require('net');

const ARP_TIMEOUT = 3000;
const TCP_TIMEOUT = 5000;

class PairingProbeError extends Error
{
    constructor(code)
    {
        super(code);
        this.code = code;
    }
}

function isValidHost(host)
{
    if (net.isIP(host))
    {
        return true;
    }

    // A dotted numeric value is intended as IPv4 and must not be accepted as a hostname.
    if (/^[0-9.]+$/.test(host))
    {
        return false;
    }

    const hostname = host.endsWith('.') ? host.slice(0, -1) : host;
    if (!hostname || hostname.length > 253)
    {
        return false;
    }

    return hostname.split('.').every((label) => label.length > 0
        && label.length <= 63
        && /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label));
}

function validateHost(host)
{
    const normalizedHost = String(host || '').trim();
    if (!isValidHost(normalizedHost))
    {
        throw new PairingProbeError('INVALID_HOST');
    }

    return normalizedHost;
}

function validatePort(port)
{
    const normalizedPort = Number(port);
    if (!Number.isInteger(normalizedPort) || normalizedPort < 1 || normalizedPort > 65535)
    {
        throw new PairingProbeError('INVALID_PORT');
    }

    return normalizedPort;
}

function testTcp(host, port, acceptRefused)
{
    return new Promise((resolve, reject) =>
    {
        const client = new net.Socket();
        let finished = false;

        const complete = (error = null) =>
        {
            if (finished)
            {
                return;
            }

            finished = true;
            client.removeAllListeners();
            client.destroy();

            if (error)
            {
                reject(error);
            }
            else
            {
                resolve();
            }
        };

        client.setTimeout(TCP_TIMEOUT);
        client.once('connect', () => complete());
        client.once('timeout', () => complete(new PairingProbeError('TIMEOUT')));
        client.once('error', (error) =>
        {
            if (acceptRefused && (error.code === 'ECONNREFUSED' || error.code === 'EALREADY'))
            {
                complete();
                return;
            }

            complete(error);
        });

        try
        {
            client.connect(port, host);
        }
        catch (error)
        {
            complete(error);
        }
    });
}

async function testArp(homey, host)
{
    if (net.isIP(host) !== 4 || !homey.arp || typeof homey.arp.getMAC !== 'function')
    {
        return false;
    }

    let timeout;
    try
    {
        const mac = await Promise.race([
            homey.arp.getMAC(host),
            new Promise((resolve) =>
            {
                timeout = homey.setTimeout(() => resolve(null), ARP_TIMEOUT);
            }),
        ]);
        return typeof mac === 'string' && mac.length > 0;
    }
    catch (error)
    {
        return false;
    }
    finally
    {
        if (timeout)
        {
            homey.clearTimeout(timeout);
        }
    }
}

async function testIpDevice(homey, host)
{
    const normalizedHost = validateHost(host);
    if (await testArp(homey, normalizedHost))
    {
        return { available: true, method: 'arp' };
    }

    await testTcp(normalizedHost, 1, true);
    return { available: true, method: 'tcp' };
}

async function testTcpService(host, port)
{
    const normalizedHost = validateHost(host);
    const normalizedPort = validatePort(port);
    await testTcp(normalizedHost, normalizedPort, false);
    return { available: true, method: 'tcp' };
}

function getProbeErrorMessage(homey, error)
{
    const keyByCode = {
        INVALID_HOST: 'pair.configuration.host_invalid',
        INVALID_PORT: 'pair.configuration.tcp_port_invalid',
        TIMEOUT: 'pair.configuration.test_timeout',
        ENOTFOUND: 'pair.configuration.test_unresolved',
        EAI_AGAIN: 'pair.configuration.test_unresolved',
        ECONNREFUSED: 'pair.configuration.test_refused',
        EHOSTUNREACH: 'pair.configuration.test_unreachable',
        ENETUNREACH: 'pair.configuration.test_unreachable',
    };
    return homey.__(keyByCode[error && error.code] || 'pair.configuration.test_failed');
}

function isPairingValidationError(error)
{
    return error && (error.code === 'INVALID_HOST' || error.code === 'INVALID_PORT');
}

module.exports = {
    getProbeErrorMessage,
    isValidHost,
    isPairingValidationError,
    testIpDevice,
    testTcpService,
    validatePort,
};
