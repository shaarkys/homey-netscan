'use strict';

const Homey = require('homey');
const nodemailer = require('nodemailer');

if (process.env.DEBUG === '1')
{
    try
    {
        require('inspector').open(9221, '0.0.0.0', false);
    }
    catch (err)
    {
        console.warn('Could not start debugger:', err.message);
    }
}

class NetScanApp extends Homey.App
{
    async onInit()
    {
        this.diagLog = "";
        this.logLevel = this.homey.settings.get('logLevel');
        if (this.logLevel === null)
        {
            this.logLevel = 0;
            this.homey.settings.set('logLevel', this.logLevel);
        }

        const ip_device_is_online_condition = this.homey.flow.getConditionCard('ip_device_is_online');
        ip_device_is_online_condition.registerRunListener(async (args, state) =>
        {
            return !args.device.offline; // true or false
        });

        const ip_device_is_offline_condition = this.homey.flow.getConditionCard('ip_device_is_offline');
        ip_device_is_offline_condition.registerRunListener(async (args, state) =>
        {
            return args.device.offline; // true or false
        });

        const device_is_online_condition = this.homey.flow.getConditionCard('device_is_online');
        device_is_online_condition.registerRunListener(async (args, state) =>
        {
            return !args.device.offline; // true or false
        });

        const device_is_offline_condition = this.homey.flow.getConditionCard('device_is_offline');
        device_is_offline_condition.registerRunListener(async (args, state) =>
        {
            return args.device.offline; // true or false
        });

        this.homey.on('cpuwarn', () =>
        {
            const drivers = this.homey.drivers.getDrivers();
            for (const driver in drivers)
            {
                const devices = this.homey.drivers.getDriver(driver).getDevices();

                for (let i = 0; i < devices.length; i++)
                {
                    const device = devices[i];
                    if (device.slowDown)
                    {
                        device.slowDown();
                    }
                }
            }

            this.updateLog('cpuwarn!', 0);
        });

        // Callback for app settings changed
        this.homey.settings.on('set', (setting) =>
        {
            this.updateLog('Setting ' + setting + ' has changed.');

            if (setting === 'logLevel')
            {
                this.logLevel = this.homey.settings.get('logLevel');
            }
        });
    }

    varToString(source)
    {
        try
        {
            if (source === null)
            {
                return "null";
            }
            if (source === undefined)
            {
                return "undefined";
            }
            if (source instanceof Error)
            {
                return source.stack || source.message;
            }
            if (typeof(source) === "object")
            {
                const getCircularReplacer = () =>
                {
                    const seen = new WeakSet();
                    return (key, value) =>
                    {
                        if (typeof value === "object" && value !== null)
                        {
                            if (seen.has(value))
                            {
                                return;
                            }
                            seen.add(value);
                        }
                        return value;
                    };
                };

                return JSON.stringify(source, getCircularReplacer(), 2);
            }
            if (typeof(source) === "string")
            {
                return source;
            }
        }
        catch (err)
        {
            this.error('varToString error:', err);
        }

        return source.toString();
    }

    updateLog(newMessage, errorLevel = 1)
    {
        const zeroPad = (num, places) => String(num).padStart(places, '0');

        if (errorLevel <= this.logLevel)
        {
            const message = this.varToString(newMessage);
            this.log(message);

            const nowTime = new Date();
            const localTime = nowTime.toLocaleTimeString('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hourCycle: 'h23',
                timeZone: this.homey.clock.getTimezone(),
            });

            this.diagLog += localTime + '.';
            this.diagLog += zeroPad(nowTime.getMilliseconds().toString(), 3);
            this.diagLog += ': ';

            if (errorLevel === 0)
            {
                this.diagLog += "!!!!!! ";
            }
            else
            {
                this.diagLog += "* ";
            }
            this.diagLog += message;
            this.diagLog += '\r\n';
            if (this.diagLog.length > 60000)
            {
                this.diagLog = this.diagLog.slice(-60000);
            }
            this.homey.api.realtime('com.netscan.logupdated', { log: this.diagLog })
                .catch((err) => this.error('Could not emit log update:', err));
        }
    }

    async sendLog(logType)
    {
        if (logType !== 'infoLog')
        {
            throw new Error('Unsupported log type');
        }

        const requiredVariables = ['MAIL_HOST', 'MAIL_USER', 'MAIL_SECRET', 'MAIL_RECIPIENT'];
        const missingVariables = requiredVariables.filter((name) => !Homey.env[name]);
        if (missingVariables.length > 0)
        {
            throw new Error('Missing mail configuration: ' + missingVariables.join(', '));
        }

        const transporter = nodemailer.createTransport({
            host: Homey.env.MAIL_HOST,
            port: 465,
            secure: true,
            auth: {
                user: Homey.env.MAIL_USER,
                pass: Homey.env.MAIL_SECRET,
            },
        });

        try
        {
            await transporter.sendMail({
                from: '"Homey User" <' + Homey.env.MAIL_USER + '>',
                to: Homey.env.MAIL_RECIPIENT,
                subject: 'Netscan Information log (' + this.manifest.version + ')',
                text: this.diagLog,
            });

            return { error: null, message: 'OK' };
        }
        catch (err)
        {
            this.updateLog('Send log error: ' + this.varToString(err), 0);
            throw err;
        }
        finally
        {
            transporter.close();
        }
    }
}
module.exports = NetScanApp;
