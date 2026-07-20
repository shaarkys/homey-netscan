/*jslint node: true */
'use strict';

const Homey = require( 'homey' );
const TcpIpDevice = require('../tcp_ip_device');

class tcpDevice extends TcpIpDevice
{
    async onInit()
    {
        console.info("Booting TCP device ", this.getName());
        await super.onInit();
    }
}
module.exports = tcpDevice;
