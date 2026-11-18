class TFile { constructor(path){ this.path=path; this.basename=path.split('/').pop().replace(/\.md$/,''); this.extension='md'; } }
class Plugin { constructor(app){ this.app=app; } async loadData(){ return this._data; } async saveData(d){ this._saved=JSON.parse(JSON.stringify(d)); }
  registerView(){} addRibbonIcon(){} addStatusBarItem(){ return {addClass(){},onClickEvent(){},empty(){},hide(){},show(){},toggleClass(){},createSpan(){return {}},setAttr(){}} }
  addCommand(){} registerEvent(){} addSettingTab(){} registerInterval(){} }
class ItemView {} class PluginSettingTab {} class Setting {}
module.exports = { TFile, Plugin, ItemView, PluginSettingTab, Setting, Notice: class { constructor(m){ console.log('NOTICE', m); } },
  debounce: (f)=>f, setIcon(){}, App: class{}, WorkspaceLeaf: class{} };
