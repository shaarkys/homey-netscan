"use strict";

// The IP driver can use ARP for local IPv4 devices and fall back to the legacy TCP response check.

const Homey = require('homey');
const {
    getProbeErrorMessage,
    isPairingValidationError,
    testIpDevice,
} = require('../../lib/pairing_probe');

class ipDriver extends Homey.Driver
{
    // the `init` method is called when your driver is loaded for the first time
    async onInit()
    {
        console.info("Booting IP driver");

        this.ip_device_came_online_trigger = this.homey.flow.getDeviceTriggerCard('ip_device_came_online');
        this.ip_device_went_offline_trigger = this.homey.flow.getDeviceTriggerCard('ip_device_went_offline');
        this.ip_device_changed_state_trigger = this.homey.flow.getDeviceTriggerCard('ip_device_change');
    }

    async onPair(session)
    {
        session.setHandler('test_connection', async ({ host }) =>
        {
            try
            {
                return await testIpDevice(this.homey, host);
            }
            catch (error)
            {
                const message = getProbeErrorMessage(this.homey, error);
                if (isPairingValidationError(error))
                {
                    throw new Error(message);
                }

                return { available: false, warning: message };
            }
        });
    }

    async device_came_online(device)
    {
        const tokens = {
            value: true
        };

        await Promise.all([
            this.ip_device_came_online_trigger.trigger(device),
            this.ip_device_changed_state_trigger.trigger(device, tokens),
        ]);
    }

    async device_went_offline(device)
    {
        const tokens = {
            value: false
        };

        await Promise.all([
            this.ip_device_went_offline_trigger.trigger(device),
            this.ip_device_changed_state_trigger.trigger(device, tokens),
        ]);
    }

}
module.exports = ipDriver;
