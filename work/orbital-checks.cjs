const fs = require('fs');
const assert = require('node:assert/strict');
const { chromium } = require('C:/Users/Brian/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const file = 'Project_Root/HTML_Projects/Orbital-Mechanics-Simulator.html';
const html = fs.readFileSync(file, 'utf8');
new (require('node:vm').Script)(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
// Expose the real functions in the test page only; the shipped file stays private.
const instrumented = html.replace('  resize();\n  syncConfigInputs();', `
  window.lab = { scenarioSnapshot, restoreScenario, validateScenario, predictTrajectory,
    velocityVerletStep, integrationSubsteps, launchProbe, bodyById, updatePhysics,
    initSystem, tick, applyBurn, refreshPreview,
    pause() { running = false; },
    state() { return { bodies, probes, camera, selected, previewPath, isAiming, isPanning, launchVel }; }
  };
  resize();
  syncConfigInputs();`);
(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'msedge' });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.setContent(instrumented);
    await page.evaluate(() => lab.pause());
    await page.evaluate(() => lab.validateScenario(lab.scenarioSnapshot()));
    console.log('PASS: page boot, initial snapshot validation');

    await page.locator('#velNum').fill('');
    assert.equal(await page.evaluate(() => lab.state().launchVel), 20);
    await page.locator('#velNum').fill('999');
    assert.equal(await page.evaluate(() => lab.state().launchVel), 60);
    await page.locator('#velNum').blur();
    assert.equal(await page.locator('#velNum').inputValue(), '60');
    await page.locator('#velNum').fill('-10');
    assert.equal(await page.evaluate(() => lab.state().launchVel), 1);
    await page.locator('#velNum').fill('20');
    const beforeInvalid = await page.evaluate(() => lab.scenarioSnapshot());
    await page.locator('#cfgSunMass').fill('-1');
    await page.locator('#rebuildBtn').click();
    assert.deepEqual(await page.evaluate(() => lab.scenarioSnapshot()), beforeInvalid);
    console.log('PASS: empty, oversized, negative inputs; invalid rebuild preserves state');

    const prediction = await page.evaluate(() => {
      const results = [];
      for (const speed of [0.25, 1, 25, 50]) {
        const snap = lab.scenarioSnapshot(); snap.timeScale = speed;
        lab.restoreScenario(snap);
        const earth = lab.bodyById('earth');
        const p = lab.launchProbe(earth, 90, 20, 4, 1);
        const before = JSON.stringify(lab.scenarioSnapshot());
        const path = lab.predictTrajectory(p.x, p.y, p.vx, p.vy, 100);
        if (before !== JSON.stringify(lab.scenarioSnapshot())) throw Error('Prediction mutated live state');
        for (let i = 0; i < path.length; i++) {
          const total = 0.025 * speed, n = lab.integrationSubsteps(total);
          for (let j = 0; j < n; j++) { lab.updatePhysics(total / n); if (p.crashed) break; }
          if (Math.hypot(p.x-path[i].x, p.y-path[i].y) > 1e-9) throw Error('Preview mismatch at speed ' + speed);
          if (p.crashed) break;
        }
        results.push(speed);
        lab.restoreScenario(snap);
      }
      return results;
    });
    assert.equal(prediction.length, 4);
    console.log('PASS: prediction/live parity at four speeds, collision termination, prediction isolation');

    await page.evaluate(() => {
      const p = lab.launchProbe(lab.bodyById('earth'),90,20,4,1);
      for(let i=0;i<30;i++)lab.updatePhysics(0.025);
      const snap=lab.scenarioSnapshot();
      snap.camera.followId=p.id;
      snap.activeMission={id:'moonFlyby',completed:true};
      snap.probes[0].fuel=42;
      snap.probes[0].crashed=true;
      snap.probes[0].lastEncounter={body:'Moon',closest:12,incoming:3,outgoing:4,delta:1};
      lab.restoreScenario(snap);
      const saved=lab.scenarioSnapshot();
      lab.initSystem(saved.config);
      lab.restoreScenario(JSON.parse(JSON.stringify(saved)));
      if(JSON.stringify(saved)!==JSON.stringify(lab.scenarioSnapshot()))throw Error('Round trip differs');
      for (const mutate of [s=>s.bodies[0].x=null,s=>s.config.sun.mass=-1,s=>s.camera.zoom=0,s=>s.version=1,s=>s.probes[0].fuel=-1,s=>s.probes[0].vx='bad']) {
        const bad=JSON.parse(JSON.stringify(saved));mutate(bad);
        let rejected=false;try{lab.restoreScenario(bad);}catch{rejected=true;}
        if(!rejected || JSON.stringify(saved)!==JSON.stringify(lab.scenarioSnapshot()))throw Error('Invalid import changed state');
      }
    });
    console.log('PASS: complete snapshot round trip and six invalid imports leave state intact');
    await page.locator('#clearProbesBtn').click();
    const cleared = await page.evaluate(() => ({selected:lab.state().selected,follow:lab.state().camera.followId}));
    assert.deepEqual(cleared, {selected:null,follow:null});
    assert.equal(await page.locator('#selectionActions').isVisible(),false);
    console.log('PASS: clearing probes clears selection and camera follow');
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportBtn').click();
    const download = await downloadPromise;
    const savedFile = await download.path();
    const downloaded = JSON.parse(fs.readFileSync(savedFile,'utf8'));
    await page.locator('#resetBtn').click();
    await page.locator('#importFile').setInputFiles(savedFile);
    await page.waitForFunction(()=>document.querySelector('#logBody').textContent.includes('snapshot restored'));
    assert.deepEqual(await page.evaluate(()=>lab.scenarioSnapshot()),downloaded);
    console.log('PASS: real browser download and file import round trip');
    await page.screenshot({ path: 'work/orbital-desktop.png' });

    let mobile = await browser.newPage({ viewport: {width:390,height:844}, isMobile:true, hasTouch:true });
    mobile.on('pageerror', e=>errors.push(e.message));
    await mobile.setContent(instrumented); await mobile.evaluate(()=>lab.pause());
    await mobile.locator('#zoomInBtn').tap();
    assert.ok(await mobile.evaluate(()=>lab.state().camera.zoom>1));
    await mobile.locator('#panelToggle').tap();
    assert.ok(await mobile.locator('#leftPanel').evaluate(e=>e.classList.contains('open')));
    await mobile.locator('#inspectorToggle').tap();
    assert.equal(await mobile.locator('#leftPanel').evaluate(e=>e.classList.contains('open')),false);
    await mobile.locator('#inspectorToggle').tap();
    let client = await mobile.context().newCDPSession(mobile);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:190,y:350}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:240,y:400}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await mobile.waitForTimeout(350); // allow the browser to finish the touch sequence before a new gesture
    assert.ok(await mobile.evaluate(()=>lab.state().camera.x<0));
    await mobile.close();
    mobile = await browser.newPage({ viewport: {width:390,height:844}, isMobile:true, hasTouch:true });
    mobile.on('pageerror', e=>errors.push(e.message));
    await mobile.setContent(instrumented); await mobile.evaluate(()=>lab.pause());
    client = await mobile.context().newCDPSession(mobile);
    // Put Earth in the usable canvas area so touch aiming is testable on a phone.
    await mobile.evaluate(()=>{
      const s=lab.scenarioSnapshot(), earth=s.bodies.find(b=>b.id==='earth');
      s.camera.x=earth.x;s.camera.y=earth.y;s.camera.zoom=1;lab.restoreScenario(s);
    });
    await mobile.locator('#panelToggle').tap();
    await mobile.locator('#toggleLaunchModeBtn').tap();
    await mobile.locator('#panelToggle').tap();
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:422}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:460}]});
    await mobile.waitForFunction(()=>lab.state().previewPath.length>0);
    await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
    assert.equal(await mobile.evaluate(()=>lab.state().probes.length),0);
    assert.equal(await mobile.evaluate(()=>lab.state().isAiming),false);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:195,y:422}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:230,y:460}]});
    await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(await mobile.evaluate(()=>lab.state().probes.length),1);
    console.log('PASS: real touch aiming, preview, cancellation without launch, and release-to-launch');
    await mobile.screenshot({path:'work/orbital-mobile.png'});
    console.log('PASS: mobile touch pan, zoom buttons, mutually exclusive panels');
    // Launch the shipped page without the test hooks as a final browser smoke check.
    await page.goto(require('node:url').pathToFileURL(require('node:path').resolve(file)).href);
    await page.locator('#playPauseBtn').click();
    await page.locator('#launchBtn').click();
    await page.waitForFunction(()=>document.querySelector('#selectionBody').textContent.includes('Fuel'));
    assert.deepEqual(errors,[]);
    console.log('PASS: no browser JavaScript errors');
  } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
