/*jslint node: true */
'use strict';

const Homey = require('homey');
const TcpIpDevice = require('../tcp_ip_device');

class ipDevice extends TcpIpDevice
{
    async onInit()
    {
        this.homey.app.updateLog("Booting IP device " + this.getName());
        await super.onInit();
    }

}
module.exports = ipDevice;
