'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const code=fs.readFileSync(path.join(__dirname,'../src/noshots-compat.js'),'utf8');
let now=0,next=1,calls=0,panelVersion=1;
const jobs=new Map(),listeners=[];
const makePanel=()=>({0:{nodeType:1,classList:{contains:c=>c==='player-panel'},version:panelVersion},length:1,find(){return this}});
let nativePanel=makePanel();
const context={console:{info(){}},setTimeout(fn,delay){const id=next++;jobs.set(id,{fn,due:now+delay});return id},Lampa:{Listener:{follow(name,fn){listeners.push(fn)}},PlayerPanel:{render(){calls++;return nativePanel},init(){panelVersion++;nativePanel=makePanel();return 'native-init'}}}};
context.window=context;vm.createContext(context);
vm.runInContext(`
var originalRender=Lampa.PlayerPanel.render;
function removeShotsPlayerButton(){Lampa.PlayerPanel.render().find('.button');}
Lampa.PlayerPanel.render=function(){var result=originalRender.call(this);setTimeout(removeShotsPlayerButton,10);return result;};
`,context);
function tick(until){let guard=0;while(true){let pair;for(const item of jobs)if(item[1].due<=until&&(!pair||item[1].due<pair[1].due))pair=item;if(!pair)break;if(++guard>100000)throw Error('timer explosion');now=pair[1].due;jobs.delete(pair[0]);pair[1].fn();}now=until;}
// Five ordinary 200 ms cleanup invocations create five self-perpetuating chains.
for(let due=0;due<1000;due+=200)context.setTimeout(context.removeShotsPlayerButton,due);
tick(1000);assert.ok(calls>=300,'reproduced multiplying legacy render calls');const legacyCalls=calls;
vm.runInContext(code,context);const getter=context.Lampa.PlayerPanel.render;tick(1100);assert.equal(jobs.size,0,'all legacy chains converge without clearing unrelated timers');
const repairedCalls=calls;for(let i=0;i<1000;i++)context.Lampa.PlayerPanel.render();tick(1500);assert.equal(calls,repairedCalls,'pure native-compatible getter schedules nothing');
assert.equal(getter(),nativePanel,'native panel identity preserved');assert.equal(context.Lampa.PlayerPanel.init(),'native-init');assert.equal(getter(),nativePanel,'explicit panel reinitialization refreshes DOM');tick(1520);assert.equal(jobs.size,0);
vm.runInContext(code,context);assert.equal(context.Lampa.PlayerPanel.render,getter,'idempotent re-evaluation');assert.equal(context.__atvp_noshots_compat.repairs,1);
// Unknown wrappers and their behavior must remain untouched.
const unknown=function(){return 'third party'};context.Lampa.PlayerPanel.render=unknown;for(const listener of listeners)listener();assert.equal(context.Lampa.PlayerPanel.render,unknown);
console.log('PASS No Shots compatibility: '+legacyCalls+' recursive calls/second reproduced, known-wrapper repair, timer convergence, native identity/reinit, idempotence and unknown wrappers');
