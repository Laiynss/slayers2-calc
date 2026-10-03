/* Local worker: same engine/functions as the calculator; no fetch/import/network.
   A replacement request terminates its predecessor. Cache bounded to 6 results. */
(function () {
  'use strict';
  const jobs = new Map(), cache = new Map();
  let serial = 0;
  function cancel(kind) {
    const job = jobs.get(kind); if (!job) return;
    jobs.delete(kind); job.worker.terminate(); URL.revokeObjectURL(job.url);
    job.resolve({ cancelled: true });
  }
  function run(kind, options, moves) {
    cancel(kind);
    const key = JSON.stringify([kind, options, [...(options.owned || [])].sort(), moves]);
    if (cache.has(key)) return Promise.resolve({ ...structuredClone(cache.get(key)), cacheHit: true });
    if (typeof Worker !== 'function') return Promise.resolve({ error: 'Background calculation is not available in this browser. Try Chrome or Edge.' });
    const code = 'self.window=self;\n' +
      [window.PS2EngineFactory, window.PS2OptimizerFactory, window.PS2BestFactory]
        .map(fn => '(' + fn.toString() + ')();').join('\n');
    // Initialize data before instantiating the engine factories.
    const boot = `self.onmessage=function(e){try{self.PS2_DATA=e.data.data;self.PS2_CONFIG=e.data.config;
      ${code}
      self.PS2Engine.setMoveOverrides(e.data.moves);
      const result=e.data.kind==='best'?self.PS2Best.run(e.data.options):self.PS2Optimizer.run(e.data.options);
      self.postMessage({result});
      }catch(err){self.postMessage({error:String(err && err.message || err)});}};`;
    return new Promise(resolve => {
      let worker, url;
      try {
        url = URL.createObjectURL(new Blob([boot], { type: 'text/javascript' }));
        worker = new Worker(url);
        const id = ++serial;
        jobs.set(kind, { worker, url, resolve, id });
        const finish = result => {
          if (jobs.get(kind)?.id !== id) return;
          jobs.delete(kind); worker.terminate(); URL.revokeObjectURL(url);
          if (!result.error) { cache.set(key, result); if (cache.size > 6) cache.delete(cache.keys().next().value); }
          resolve(result);
        };
        worker.onmessage = e => finish(e.data.error ? { error: e.data.error } : e.data.result);
        worker.onerror = e => { e.preventDefault(); finish({ error: 'Calcul interrompu : ' + e.message }); };
        worker.postMessage({ kind, options, moves, data: window.PS2_DATA, config: window.PS2_CONFIG });
      } catch (err) {
        if (worker) worker.terminate(); if (url) URL.revokeObjectURL(url); jobs.delete(kind);
        resolve({ error: 'Could not start the background calculation: ' + err.message });
      }
    });
  }
  window.addEventListener('pagehide', () => [...jobs.keys()].forEach(cancel));
  window.PS2Search = { run, cancel, get active() { return [...jobs.keys()]; } };
})();
