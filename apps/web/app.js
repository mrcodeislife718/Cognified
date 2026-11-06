const $ = (id) => document.getElementById(id);
let currentExperience = null;
let currentSessionId = null;
let currentPacing = null;
let demoTimer = null;

function stopDemo() {
  if (demoTimer !== null) clearTimeout(demoTimer);
  demoTimer = null;
}

function renderPacing(pacing) {
  currentPacing = pacing;
  if (!pacing) return;
  $('pacingStatus').textContent = pacing.mode === 'paused'
    ? 'Simulation paused — explicit user resume required'
    : 'Presentation rate: ' + pacing.presentationRate.toFixed(2) + '× · ' + pacing.reason;
  $('resumeDemo').disabled = pacing.mode !== 'paused';
  if (pacing.mode === 'paused') stopDemo();
}

function playDemo() {
  stopDemo();
  if (!currentExperience || !currentPacing || currentPacing.mode !== 'running') return;
  const chunks = currentExperience.prompt.split(/(?<=[.!?])\s+|,\s+/).filter(Boolean);
  let index = 0;
  const showNext = () => {
    if (!currentPacing || currentPacing.mode !== 'running') return;
    $('demoStep').textContent = chunks[index] || '';
    index += 1;
    if (index < chunks.length) {
      // Smooth narrative stepping; never frequency flashing or strobing.
      demoTimer = setTimeout(showNext, Math.max(1000, 2400 / currentPacing.presentationRate));
    } else demoTimer = null;
  };
  showNext();
}


function show(value) {
  $('log').textContent = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function renderExperience(experience) {
  currentExperience = experience;
  stopDemo();
  $('demoStep').textContent = 'Select Play demonstration to step through the learning prompt.';
  $('experienceSection').hidden = !experience;
  if (!experience) return;
  $('objective').textContent = experience.objective;
  $('prompt').textContent = experience.prompt;
}

function renderScore(score) {
  const values = [
    ['Overall', score.overall],
    ['Recall', score.recall],
    ['Recognition', score.recognition],
    ['Procedure', score.procedure],
    ['Transfer', score.transfer],
    ['Error detection', score.errorDetection],
    ['Retention', score.retention],
    ['Prerequisite mastery', score.prerequisiteMastery],
    ['Evidence strength', score.evidenceStrength],
    ['Confidence calibration', score.confidenceCalibration],
    ['Assistance dependency', score.assistanceDependency],
  ];
  $('metrics').innerHTML = values.map(([label, value]) => `<span class="metric">${label}: ${value}%</span>`).join('');
}

$('compile').addEventListener('click', async () => {
  try {
    const graph = await api('/skills', {
      method: 'POST',
      body: JSON.stringify({
        title: $('skillTitle').value,
        sources: [{
          title: $('sourceTitle').value,
          text: $('sourceText').value,
          authority: 'user',
        }],
      }),
    });
    $('skillId').value = graph.id;
    show(graph);
  } catch (error) {
    show(error.message);
  }
});

$('start').addEventListener('click', async () => {
  try {
    const learner = encodeURIComponent($('learnerId').value);
    const skill = encodeURIComponent($('skillId').value);
    const session = await api(`/learners/${learner}/skills/${skill}/session`, { method: 'POST' });
    currentSessionId = session.sessionId;
    renderPacing(session.pacing);
    renderExperience(session.experience);
    show(session);
  } catch (error) {
    show(error.message);
  }
});

$('submit').addEventListener('click', async () => {
  if (!currentExperience || !currentSessionId) return;
  try {
    const result = await api('/events', {
      method: 'POST',
      body: JSON.stringify({
        id: crypto.randomUUID(),
        sessionId: currentSessionId,
        learnerId: $('learnerId').value,
        skillId: $('skillId').value,
        nodeId: currentExperience.nodeId,
        kind: $('kind').value,
        correct: $('correct').value === 'true',
        responseMs: Number($('responseMs').value),
        confidence: Number($('confidence').value),
        assistanceUsed: $('assistance').checked,
      }),
    });
    renderPacing(result.pacing);
    renderScore(result.competency);
    renderExperience(result.nextExperience);
    show(result);
  } catch (error) {
    show(error.message);
  }
});

$('xr').addEventListener('click', async () => {
  try {
    if (!navigator.xr) throw new Error('WebXR is not available in this browser.');
    const supported = await navigator.xr.isSessionSupported('immersive-vr');
    if (!supported) throw new Error('Immersive VR is not supported on this device.');
    const session = await navigator.xr.requestSession('immersive-vr');
    show({ immersive: true, session: 'active' });
    session.addEventListener('end', () => show({ immersive: false, session: 'ended' }));
  } catch (error) {
    show(error.message);
  }
});

$('playDemo').addEventListener('click', playDemo);
$('pauseDemo').addEventListener('click', async () => {
  stopDemo();
  await reportComfort('stop');
});
$('resumeDemo').addEventListener('click', async () => {
  await reportComfort('ok', true);
});
$('strainDemo').addEventListener('click', async () => {
  await reportComfort('strained');
});
$('nauseaDemo').addEventListener('click', async () => {
  stopDemo();
  await reportComfort('nauseated');
});

async function reportComfort(comfort, resume = false) {
  if (!currentSessionId) return show('Start a session first.');
  try {
    const pacing = await api('/pacing/comfort', {
      method: 'POST',
      body: JSON.stringify({
        sessionId: currentSessionId,
        learnerId: $('learnerId').value,
        skillId: $('skillId').value,
        comfort, resume,
      }),
    });
    renderPacing(pacing);
    show(pacing);
  } catch (error) {
    show(error.message);
  }
}
