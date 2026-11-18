module.exports = new Proxy({}, {get:(t,k)=> k==="Plugin"||k==="ItemView"||k==="PluginSettingTab"||k==="Component"? class{} : ()=>{}})
