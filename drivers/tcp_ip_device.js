'use strict';

const Homey = require('homey');
const net = require('net');

const ARP_TIMEOUT = 3000;
const IP_PROBE_METHODS = new Set(['automatic', 'arp', 'tcp']);

class TcpIpDevice extends Homey.Device
{
    async onInit()
    {
        this.client = null;
        this.checkTimer = null;
        this.cancelCheck = null;
        this.scanGeneration = 0;
        this.stopped = false;
        this.unreachableCount = 0;
        this.deferredCapabilities = new Set();

        this.reachable = await this.migrateCapabilities();
        if (!this.deferredCapabilities.has('reachable') && this.hasCapability('reachable'))
        {
            const currentReachable = this.getCapabilityValue('reachable');
            if (typeof currentReachable === 'boolean')
            {
                this.reachable = currentReachable;
            }

            this.registerReadOnlyCapabilityListener('reachable');
        }

        if (!this.deferredCapabilities.has('onoff') && this.hasCapability('onoff'))
        {
            this.registerReadOnlyCapabilityListener('onoff');
        }

        await this.initializeReachabilityTracking();
        this.applySettings(this.getSettings());
        this.scanDevice();
    }

    registerReadOnlyCapabilityListener(capabilityId)
    {
        this.registerCapabilityListener(capabilityId, async () =>
        {
            // Homey may still dispatch a request from a cached quick action; restore the measured state.
            this.homey.setTimeout(() =>
            {
                this.setCapabilityValue(capabilityId, this.reachable === true)
                    .catch((err) => this.error(`Could not restore read-only ${capabilityId}:`, err));
            }, 0);
        });
    }

    async initializeReachabilityTracking()
    {
        const now = Date.now();
        const storedState = this.getStoreValue('reachabilityState');
        const storedChangedAt = Number(this.getStoreValue('reachabilityChangedAt'));

        if (typeof this.reachable === 'boolean'
            && storedState === this.reachable
            && Number.isFinite(storedChangedAt)
            && storedChangedAt > 0
            && storedChangedAt <= now)
        {
            this.reachabilityChangedAt = storedChangedAt;
            return;
        }

        this.reachabilityChangedAt = now;
        if (typeof this.reachable === 'boolean')
        {
            await this.persistReachabilityTracking(this.reachable);
        }
    }

    async persistReachabilityTracking(reachable)
    {
        this.reachabilityChangedAt = Date.now();
        try
        {
            await Promise.all([
                this.setStoreValue('reachabilityState', reachable),
                this.setStoreValue('reachabilityChangedAt', this.reachabilityChangedAt),
            ]);
        }
        catch (err)
        {
            this.error('Could not persist the reachability duration:', err);
        }
    }

    hasReachabilityStateFor(state, duration, unit)
    {
        const expectedReachable = state === 'online';
        if ((state !== 'online' && state !== 'offline') || this.reachable !== expectedReachable)
        {
            return false;
        }

        const amount = Number(duration);
        const multiplier = unit === 'minutes' ? 60 * 1000 : unit === 'seconds' ? 1000 : null;
        if (!Number.isFinite(amount) || amount < 0 || multiplier === null
            || !Number.isFinite(this.reachabilityChangedAt))
        {
            return false;
        }

        return Date.now() - this.reachabilityChangedAt >= amount * multiplier;
    }

    async migrateCapabilities()
    {
        const hasReachable = this.hasCapability('reachable');
        let previousReachable = hasReachable
            ? this.getCapabilityValue('reachable')
            : null;

        if (typeof previousReachable !== 'boolean' && this.hasCapability('alarm_offline'))
        {
            const previousOffline = this.getCapabilityValue('alarm_offline');
            if (typeof previousOffline === 'boolean')
            {
                previousReachable = !previousOffline;
            }
        }
        if (typeof previousReachable !== 'boolean' && this.hasCapability('ip_present'))
        {
            const previousPresent = this.getCapabilityValue('ip_present');
            if (typeof previousPresent === 'boolean')
            {
                previousReachable = previousPresent;
            }
        }
        if (typeof previousReachable !== 'boolean' && this.hasCapability('onoff'))
        {
            const previousOnOff = this.getCapabilityValue('onoff');
            if (typeof previousOnOff === 'boolean')
            {
                previousReachable = previousOnOff;
            }
        }

        if (!hasReachable)
        {
            await this.addCapability('reachable');
            this.deferredCapabilities.add('reachable');
        }

        for (const capabilityId of ['alarm_offline', 'onoff'])
        {
            if (!this.hasCapability(capabilityId))
            {
                await this.addCapability(capabilityId);
                this.deferredCapabilities.add(capabilityId);
            }
        }

        await this.configureLegacyCapability('alarm_offline');
        await this.configureLegacyCapability('onoff');

        if (typeof previousReachable === 'boolean')
        {
            await this.setReachabilityCapabilities(previousReachable);
        }

        if (this.hasCapability('ip_present'))
        {
            await this.removeCapability('ip_present');
        }

        return previousReachable;
    }

    async configureLegacyCapability(capabilityId)
    {
        if (this.deferredCapabilities.has(capabilityId) || !this.hasCapability(capabilityId))
        {
            return;
        }

        let options;
        try
        {
            options = this.getCapabilityOptions(capabilityId);
        }
        catch (err)
        {
            this.log(`Deferring ${capabilityId} options until the capability is available`);
            return;
        }

        const expectedOptions = {
            uiComponent: null,
            preventInsights: true,
            ...(capabilityId === 'onoff' ? {
                getable: true,
                setable: false,
                title: {
                    en: 'Online state (legacy)',
                    nl: 'Online-status (verouderd)',
                    de: 'Online-Status (veraltet)',
                },
            } : {}),
        };
        const needsUpdate = Object.entries(expectedOptions)
            .some(([option, value]) =>
            {
                if (value && typeof value === 'object')
                {
                    const currentValue = options[option] || {};
                    return !Object.entries(value)
                        .every(([key, nestedValue]) => currentValue[key] === nestedValue);
                }

                return options[option] !== value;
            });

        if (needsUpdate)
        {
            await this.setCapabilityOptions(capabilityId, {
                ...options,
                ...expectedOptions,
            });
        }
    }

    async setReachabilityCapabilities(reachable)
    {
        const values = {
            reachable,
            alarm_offline: !reachable,
            onoff: reachable,
        };

        await Promise.all(Object.entries(values).map(async ([capabilityId, value]) =>
        {
            if (!this.deferredCapabilities.has(capabilityId)
                && this.hasCapability(capabilityId)
                && this.getCapabilityValue(capabilityId) !== value)
            {
                await this.setCapabilityValue(capabilityId, value);
            }
        }));
    }

    applySettings(settings)
    {
        this.host = String(settings.host || '').trim();

        if (settings.tcp_port === null || settings.tcp_port === undefined || settings.tcp_port === '')
        {
            this.port = null;
        }
        else
        {
            this.port = Number(settings.tcp_port);
        }

        this.probeMethod = this.port === null && IP_PROBE_METHODS.has(settings.probe_method)
            ? settings.probe_method
            : 'tcp';

        const interval = Number(settings.host_check_interval);
        this.checkInterval = 1000 * (Number.isFinite(interval) && interval >= 15 ? interval : 15);

        const timeout = Number(settings.host_timeout);
        this.hostTimeout = 1000 * (Number.isFinite(timeout) && timeout >= 10 ? timeout : 10);

        const unreachableChecks = Number(settings.host_unreachable_checks);
        const maxChecks = Number.isInteger(unreachableChecks) && unreachableChecks >= 1
            ? unreachableChecks
            : 1;
        this.maxUnreachableAttempts = maxChecks - 1;
    }

    async onDeleted()
    {
        this.stopPolling();
    }

    async onUninit()
    {
        this.stopPolling();
    }

    async onSettings({ newSettings })
    {
        const host = String(newSettings.host || '').trim();
        if (newSettings.probe_method === 'arp' && net.isIP(host) !== 4)
        {
            throw new Error(this.homey.__('errors.arp_ipv4_required'));
        }

        this.applySettings(newSettings);
        this.cancelCurrentScan();
        this.scanDevice();
    }

    stopPolling()
    {
        this.stopped = true;
        this.cancelCurrentScan();
    }

    cancelCurrentScan()
    {
        this.scanGeneration++;

        if (this.checkTimer)
        {
            this.homey.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        if (this.cancelCheck)
        {
            this.homey.clearTimeout(this.cancelCheck);
            this.cancelCheck = null;
        }

        if (this.client)
        {
            this.client.removeAllListeners();
            this.client.destroy();
            this.client = null;
        }
    }

    scheduleNextScan(generation)
    {
        if (this.stopped || generation !== this.scanGeneration)
        {
            return;
        }

        this.checkTimer = this.homey.setTimeout(() =>
        {
            this.checkTimer = null;
            this.scanDevice();
        }, this.checkInterval);
    }

    scanDevice()
    {
        if (this.stopped || !this.host)
        {
            return;
        }

        if (this.checkTimer)
        {
            this.homey.clearTimeout(this.checkTimer);
            this.checkTimer = null;
        }

        const generation = ++this.scanGeneration;
        if (this.port === null && this.probeMethod !== 'tcp')
        {
            this.scanWithArp(generation);
            return;
        }

        this.scanWithTcp(generation);
    }

    scanWithArp(generation)
    {
        let finished = false;
        const automatic = this.probeMethod === 'automatic';

        const complete = (online, error) =>
        {
            if (finished || this.stopped || generation !== this.scanGeneration)
            {
                return;
            }

            finished = true;
            if (this.cancelCheck)
            {
                this.homey.clearTimeout(this.cancelCheck);
                this.cancelCheck = null;
            }

            if (online)
            {
                this.completeScan(true, generation).catch((err) => this.error(err));
                return;
            }

            if (error)
            {
                this.homey.app.updateLog(`${this.getName()} - ${this.host} ARP check failed: `
                    + (error.code || error.message || error));
            }

            if (automatic)
            {
                this.homey.app.updateLog(`${this.getName()} - ${this.host} falling back to TCP response check`);
                this.scanWithTcp(generation);
                return;
            }

            this.completeScan(false, generation).catch((err) => this.error(err));
        };

        if (net.isIP(this.host) !== 4)
        {
            complete(false, new Error('ARP requires an IPv4 address'));
            return;
        }

        if (!this.homey.arp || typeof this.homey.arp.getMAC !== 'function')
        {
            complete(false, new Error('ARP is not available on this Homey'));
            return;
        }

        this.homey.app.updateLog(`Checking ARP device ${this.getName()} - ${this.host}`);
        this.cancelCheck = this.homey.setTimeout(() =>
        {
            complete(false, new Error('ARP timeout'));
        }, Math.min(this.hostTimeout, ARP_TIMEOUT));

        this.homey.arp.getMAC(this.host)
            .then((mac) => complete(typeof mac === 'string' && mac.length > 0))
            .catch((err) => complete(false, err));
    }

    scanWithTcp(generation)
    {
        const client = new net.Socket();
        let finished = false;
        this.client = client;

        const target = this.host + (this.port === null ? '' : ':' + this.port);
        this.homey.app.updateLog('Checking ' + (this.port === null ? 'IP' : 'TCP') + ' device '
            + this.getName() + ' - ' + target);

        const complete = async (online) =>
        {
            if (finished || this.stopped || generation !== this.scanGeneration)
            {
                return;
            }

            finished = true;
            if (this.cancelCheck)
            {
                this.homey.clearTimeout(this.cancelCheck);
                this.cancelCheck = null;
            }

            client.removeAllListeners();
            client.destroy();
            if (this.client === client)
            {
                this.client = null;
            }

            await this.completeScan(online, generation);
        };

        client.once('connect', () =>
        {
            complete(true).catch((err) => this.error(err));
        });

        client.once('error', (err) =>
        {
            this.homey.app.updateLog(this.getName() + ' - ' + target + ' connection error ' + (err.code || err.message));
            const hostResponded = this.port === null && (err.code === 'ECONNREFUSED' || err.code === 'EALREADY');
            complete(hostResponded).catch((completeError) => this.error(completeError));
        });

        this.cancelCheck = this.homey.setTimeout(() =>
        {
            this.homey.app.updateLog('Device timeout ' + this.getName() + ' - ' + target);
            complete(false).catch((err) => this.error(err));
        }, this.hostTimeout);

        try
        {
            client.connect(this.port === null ? 1 : this.port, this.host);
        }
        catch (err)
        {
            this.homey.app.updateLog(this.getName() + ' - ' + target + ' connection error ' + err.message);
            complete(false).catch((completeError) => this.error(completeError));
        }
    }

    async completeScan(online, generation)
    {
        if (this.stopped || generation !== this.scanGeneration)
        {
            return;
        }

        try
        {
            await this.recordObservation(online);
        }
        catch (err)
        {
            this.error('Could not update device state:', err);
        }
        finally
        {
            this.scheduleNextScan(generation);
        }
    }

    async recordObservation(online)
    {
        if (online)
        {
            this.unreachableCount = 0;
            await this.handleOnline();
            return;
        }

        if (this.unreachableCount >= this.maxUnreachableAttempts)
        {
            await this.handleOffline();
            return;
        }

        this.homey.app.updateLog(`${this.getName()} - ${this.host} offline postponed for `
            + `${this.maxUnreachableAttempts - this.unreachableCount} more checks`);
        this.unreachableCount++;
    }

    async handleOnline()
    {
        if (this.reachable !== true)
        {
            this.homey.app.updateLog('**** Device came Online ' + this.getName() + ' - ' + this.host);
            this.reachable = true;
            await this.persistReachabilityTracking(true);
            await this.setReachabilityCapabilities(true);
            await this.driver.device_came_online(this);
        }
        else
        {
            this.homey.app.updateLog('Device still Online ' + this.getName() + ' - ' + this.host);
        }
    }

    async handleOffline()
    {
        if (this.reachable !== false)
        {
            this.homey.app.updateLog('!!!! Device went Offline ' + this.getName() + ' - ' + this.host);
            this.reachable = false;
            await this.persistReachabilityTracking(false);
            await this.setReachabilityCapabilities(false);
            await this.driver.device_went_offline(this);
        }
        else
        {
            this.homey.app.updateLog('Device still Offline ' + this.getName() + ' - ' + this.host);
        }
    }

    slowDown()
    {
        this.checkInterval = Math.min(this.checkInterval * 2, 60 * 60 * 1000);
        this.homey.app.updateLog('Device slow down ' + this.checkInterval);
    }
}

module.exports = TcpIpDevice;
