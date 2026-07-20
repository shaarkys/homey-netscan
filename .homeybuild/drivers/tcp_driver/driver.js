"use strict";

const Homey = require('homey');
const {
    getProbeErrorMessage,
    isPairingValidationError,
    testTcpService,
} = require('../../lib/pairing_probe');

// the `init` method is called when your driver is loaded for the first time
class tcpDriver extends Homey.Driver
{
    async onInit()
    {
        console.info("Booting TCP driver");

        this.device_came_online_trigger = this.homey.flow.getDeviceTriggerCard('device_came_online');
        this.device_went_offline_trigger = this.homey.flow.getDeviceTriggerCard('device_went_offline');
        this.device_changed_state_trigger = this.homey.flow.getDeviceTriggerCard('device_change');
    }

    async onPair(session)
    {
        session.setHandler('test_connection', async ({ host, port }) =>
        {
            try
            {
                return await testTcpService(host, port);
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
            this.device_came_online_trigger.trigger(device),
            this.device_changed_state_trigger.trigger(device, tokens),
        ]);
    }

    async device_went_offline(device)
    {
        const tokens = {
            value: false
        };

        await Promise.all([
            this.device_went_offline_trigger.trigger(device),
            this.device_changed_state_trigger.trigger(device, tokens),
        ]);
    }

}
module.exports = tcpDriver;
