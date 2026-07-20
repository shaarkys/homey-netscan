/*jslint node: true */
module.exports = {
    async getLog({ homey })
    {
        return homey.app.diagLog;
    },
    async clearLog({ homey })
    {
        homey.app.diagLog = "";
        return 'OK';
    },
    async sendInfoLog({ homey })
    {
        return homey.app.sendLog('infoLog');
    },
};
