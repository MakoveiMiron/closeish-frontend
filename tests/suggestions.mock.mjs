import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../community.js',import.meta.url),'utf8');
function setup(post){
 const handlers=new Map(),deleted=[],writes=[];
 const button={disabled:false},status={textContent:'',classList:{add(){},remove(){}},focus(){}};
 const values={question:'Name a museum with at most 500 exhibits.',direction:'below'};
 const form={addEventListener(event,callback){handlers.set(event,callback)},querySelectorAll(){return []},
   querySelector(sel){return sel==='#submitSuggestion'?button:{focus(){},setAttribute(){}}},reset(){values.question='';values.direction=''}};
 const nodes={suggestionForm:form,suggestionStatus:status};
 const sandbox={
   globalThis:{CLOSEISHApi:{post}},
   localStorage:{removeItem(key){deleted.push(key)},setItem(...args){writes.push(args)}},
   document:{getElementById(id){return nodes[id]||{textContent:''}}},
   FormData:class{constructor(){}get(key){return values[key]}},
 };
 vm.runInNewContext(code,sandbox);
 return {api:sandbox.globalThis.CLOSEISHCommunity,handlers,button,status,values,deleted,writes};
}
test('Suggest sends a private POST and does not create local export/history',async()=>{
 const requests=[];const ui=setup(async(...args)=>{requests.push(args);return {ok:true}});
 const html=ui.api.suggestionHTML();
 for(const disallowed of ['DOWNLOAD IDEAS','exportSuggestions','SAVED IDEAS','LOCAL DEMO'])assert.ok(!html.includes(disallowed));
 assert.match(html,/SEND IDEA/);
 assert.deepEqual(ui.deleted,['closeish-question-suggestions-v1','closeish-question-draft-v1']);
 ui.api.bindSuggestion();
 await ui.handlers.get('submit')({preventDefault(){}});
 assert.equal(requests.length,1);assert.equal(requests[0][0],'/api/v1/suggestions');
 assert.deepEqual(JSON.parse(JSON.stringify(requests[0][1])),{question:'Name a museum with at most 500 exhibits.',direction:'below'});
 assert.match(ui.status.textContent,/reached CLOSEISH/);
 assert.equal(ui.button.disabled,false);assert.equal(ui.writes.length,0);
});
test('Suggest does not report successful submission when the backend fails',async()=>{
 const ui=setup(async()=>{throw Object.assign(new Error('Offline'),{status:503})});
 ui.api.bindSuggestion();
 await ui.handlers.get('submit')({preventDefault(){}});
 assert.doesNotMatch(ui.status.textContent,/reached CLOSEISH/);
 assert.match(ui.status.textContent,/Could not send/);
 assert.equal(ui.values.question,'Name a museum with at most 500 exhibits.');
 assert.equal(ui.button.disabled,false);
 assert.equal(ui.writes.length,0);
});
