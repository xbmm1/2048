const fs=require('fs'),assert=require('node:assert/strict');
const {chromium}=require('C:/Users/Brian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
let html=fs.readFileSync('Project_Root/HTML_Projects/Orbital-Mechanics-Simulator.html','utf8');
html=html.replace('  resize();\n  syncConfigInputs();',`window.lab={scenarioSnapshot,restoreScenario,probeCollisionRadius,predictTrajectory,launchProbe,bodyById,updatePhysics,integrationSubsteps,pickEntityAt,worldToScreen,draw,pause(){running=false;}};
  resize();
  syncConfigInputs();`);
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
for(const mobile of [false,true]){
const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);
const result=await page.evaluate(()=>{
 document.querySelector('#realisticBtn').click();lab.pause();const s=lab.scenarioSnapshot();
 const earth=s.bodies[1],moon=s.bodies[2],mars=s.bodies[3];
 if(s.camera.zoom!==0.5||s.camera.x!==earth.x||s.camera.y!==earth.y||s.camera.followId!==null)throw Error('starting camera');
 if(earth.radius!==1||moon.radius!==0.27||mars.radius!==0.53||Math.abs(Math.hypot(mars.x,mars.y)-3960)>1e-8)throw Error('geometry');
 const m=lab.worldToScreen(mars.x,mars.y);if(m.x>=0&&m.x<=innerWidth&&m.y>=0&&m.y<=innerHeight)throw Error('Mars initially visible');
 if(lab.pickEntityAt(moon.x,moon.y).id!=='moon')throw Error('Moon selection');
 const old=JSON.parse(JSON.stringify(s));delete old.config.scaleMode;lab.restoreScenario(old);if(lab.probeCollisionRadius()!==3)throw Error('legacy collision');
 lab.restoreScenario(s);if(lab.probeCollisionRadius()!==0.03)throw Error('new collision');
 for(const z of [0.01,64]){const t=JSON.parse(JSON.stringify(s));t.camera.zoom=z;lab.restoreScenario(t);if(lab.scenarioSnapshot().camera.zoom!==z)throw Error('zoom snapshot');}
 lab.restoreScenario(s);document.querySelector('#resetBtn').click();lab.pause();if(lab.scenarioSnapshot().camera.zoom!==0.5)throw Error('reset');
 document.querySelector('#rebuildBtn').click();lab.pause();if(lab.scenarioSnapshot().camera.x!==2600||lab.scenarioSnapshot().config.scaleMode!=='realistic')throw Error('rebuild');
 for(const speed of [0.25,1,10,50]){
 lab.restoreScenario(s);const t=lab.scenarioSnapshot();t.timeScale=speed;lab.restoreScenario(t);
 const p=lab.launchProbe(lab.bodyById('earth'),90,20,4,1);const path=lab.predictTrajectory(p.x,p.y,p.vx,p.vy,100);
 for(const point of path){const n=lab.integrationSubsteps(0.025*speed);for(let j=0;j<n;j++){lab.updatePhysics(0.025*speed/n);if(p.crashed)break;}if(Math.hypot(p.x-point.x,p.y-point.y)>1e-8)throw Error('prediction mismatch');if(p.crashed)break;}
 for(let i=0;i<1000;i++){const n=lab.integrationSubsteps(0.025*speed);for(let j=0;j<n;j++)lab.updatePhysics(0.025*speed/n);}
 for(const b of lab.scenarioSnapshot().bodies)if(![b.x,b.y,b.vx,b.vy].every(Number.isFinite))throw Error('nonfinite state');
 }
 lab.restoreScenario(s);document.querySelector('#simplifiedBtn').click();lab.pause();const simple=lab.scenarioSnapshot();if(simple.bodies[1].radius!==11||simple.bodies[1].x!==260||simple.camera.zoom!==1||lab.probeCollisionRadius()!==3)throw Error('simplified changed');
 lab.restoreScenario(s);lab.draw();return s;
});
await page.screenshot({path:`work/realistic-${mobile?'mobile':'desktop'}.png`});
await page.evaluate(()=>{const s=lab.scenarioSnapshot();s.camera.zoom=0.02;lab.restoreScenario(s);lab.draw();const p=lab.worldToScreen(s.bodies[3].x,s.bodies[3].y);if(p.x<0||p.x>innerWidth||p.y<0||p.y>innerHeight)throw Error('Mars unavailable');});
await page.screenshot({path:`work/realistic-wide-${mobile?'mobile':'desktop'}.png`});
await page.evaluate(()=>{const s=lab.scenarioSnapshot();s.camera.zoom=8;lab.restoreScenario(s);lab.draw();});
await page.screenshot({path:`work/realistic-moon-${mobile?'mobile':'desktop'}.png`});
assert.deepEqual(errors,[]);console.log('PASS '+(mobile?'mobile':'desktop')+': preset geometry, starting view, Mars zoom-out, Moon hit target, zoom/snapshot limits, legacy collisions, reset/rebuild, predictions, finite multi-speed evolution, Simplified regression.');await page.close();
}
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
