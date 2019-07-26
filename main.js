const DRUM_CLASSES = [
  'Kick',
  'Snare',
  'Hi-hat closed',
  'Hi-hat open',
  'Tom low',
  'Tom mid',
  'Tom high',
  'Clap',
  'Rim'
];

const TIME_HUMANIZATION = 0.01;

let Tone = mm.Player.tone;

let sampleBaseUrl = 'localized/sound';

let reverb = new Tone.Convolver(
    `${sampleBaseUrl}/small-drum-room.wav`
).toMaster();
reverb.wet.value = 0.35;

let snarePanner = new Tone.Panner().connect(reverb);
new Tone.LFO(0.13, -0.25, 0.25).connect(snarePanner.pan).start();

let drumKit = [
  new Tone.Players({
    high: `${sampleBaseUrl}/808-kick-vh.mp3`,
    med: `${sampleBaseUrl}/808-kick-vm.mp3`,
    low: `${sampleBaseUrl}/808-kick-vl.mp3`
  }).toMaster(),
  new Tone.Players({
    high: `${sampleBaseUrl}/flares-snare-vh.mp3`,
    med: `${sampleBaseUrl}/flares-snare-vm.mp3`,
    low: `${sampleBaseUrl}/flares-snare-vl.mp3`
  }).connect(snarePanner),
  new Tone.Players({
    high: `${sampleBaseUrl}/808-hihat-vh.mp3`,
    med: `${sampleBaseUrl}/808-hihat-vm.mp3`,
    low: `${sampleBaseUrl}/808-hihat-vl.mp3`
  }).connect(new Tone.Panner(-0.5).connect(reverb)),
  new Tone.Players({
    high: `${sampleBaseUrl}/808-hihat-open-vh.mp3`,
    med: `${sampleBaseUrl}/808-hihat-open-vm.mp3`,
    low: `${sampleBaseUrl}/808-hihat-open-vl.mp3`
  }).connect(new Tone.Panner(-0.5).connect(reverb)),
  new Tone.Players({
    high: `${sampleBaseUrl}/slamdam-tom-low-vh.mp3`,
    med: `${sampleBaseUrl}/slamdam-tom-low-vm.mp3`,
    low: `${sampleBaseUrl}/slamdam-tom-low-vl.mp3`
  }).connect(new Tone.Panner(-0.4).connect(reverb)),
  new Tone.Players({
    high: `${sampleBaseUrl}/slamdam-tom-mid-vh.mp3`,
    med: `${sampleBaseUrl}/slamdam-tom-mid-vm.mp3`,
    low: `${sampleBaseUrl}/slamdam-tom-mid-vl.mp3`
  }).connect(reverb),
  new Tone.Players({
    high: `${sampleBaseUrl}/slamdam-tom-high-vh.mp3`,
    med: `${sampleBaseUrl}/slamdam-tom-high-vm.mp3`,
    low: `${sampleBaseUrl}/slamdam-tom-high-vl.mp3`
  }).connect(new Tone.Panner(0.4).connect(reverb)),
  new Tone.Players({
    high: `${sampleBaseUrl}/909-clap-vh.mp3`,
    med: `${sampleBaseUrl}/909-clap-vm.mp3`,
    low: `${sampleBaseUrl}/909-clap-vl.mp3`
  }).connect(new Tone.Panner(0.5).connect(reverb)),
  new Tone.Players({
    high: `${sampleBaseUrl}/909-rim-vh.wav`,
    med: `${sampleBaseUrl}/909-rim-vm.wav`,
    low: `${sampleBaseUrl}/909-rim-vl.wav`
  }).connect(new Tone.Panner(0.5).connect(reverb))
];
let midiDrums = [36, 38, 42, 46, 41, 43, 45, 49, 51];
let reverseMidiMapping = new Map([
  [36, 0],
  [35, 0],
  [38, 1],
  [27, 1],
  [28, 1],
  [31, 1],
  [32, 1],
  [33, 1],
  [34, 1],
  [37, 1],
  [39, 1],
  [40, 1],
  [56, 1],
  [65, 1],
  [66, 1],
  [75, 1],
  [85, 1],
  [42, 2],
  [44, 2],
  [54, 2],
  [68, 2],
  [69, 2],
  [70, 2],
  [71, 2],
  [73, 2],
  [78, 2],
  [80, 2],
  [46, 3],
  [67, 3],
  [72, 3],
  [74, 3],
  [79, 3],
  [81, 3],
  [45, 4],
  [29, 4],
  [41, 4],
  [61, 4],
  [64, 4],
  [84, 4],
  [48, 5],
  [47, 5],
  [60, 5],
  [63, 5],
  [77, 5],
  [86, 5],
  [87, 5],
  [50, 6],
  [30, 6],
  [43, 6],
  [62, 6],
  [76, 6],
  [83, 6],
  [49, 7],
  [55, 7],
  [57, 7],
  [58, 7],
  [51, 8],
  [52, 8],
  [53, 8],
  [59, 8],
  [82, 8]
]);

let seed_input = [[8], [1,2], [2], [1]];

let temperature = 1.0;

let state = {
  patternLength: 32,
  seedLength: 4,
  swing: 0.55,
  pattern: seed_input.concat(_.times(32, i => [])),
  tempo: 120
};

let stepEls = [],
    hasBeenStarted = false,
    oneEighth = Tone.Time('8n').toSeconds(),
    activeOutput = 'internal',
    midiClockSenxder = null,
    midiClockStartSent = false,
    activeClockInput = 'none',
    currentSchedulerId,
    stepCounter;

let outputs = {
  internal: {
    play: (drumIdx, velocity, time) => {
      drumKit[drumIdx].get(velocity).start(time);
    }
  }
};

let rnn = new mm.MusicRNN(
    'localized/models/tfjs_drum_kit_rnn'
);

// A plugin for code showing from https://ace.c9.io/
let editor = ace.edit("left_code");
editor.setTheme("ace/theme/solarized_dark");
editor.session.setMode("ace/mode/javascript");

Promise.all([
  rnn.initialize(),
  new Promise(res => Tone.Buffer.on('load', res))
]).then(([lets]) => {
  WebMidi.enable(err => {
    if (err) {
      console.error('WebMidi could not be enabled', err);
      return;
    }
    let activeClockOutput,
        midiClockCounter = 0,
        eighthsCounter = 0,
        lastEighthAt;

    Tone.Transport.clear(currentSchedulerId);
    currentSchedulerId = null;
    currentSchedulerId = Tone.Transport.scheduleRepeat(tick, '16n');
    oneEighth = Tone.Time('8n').toSeconds();

    function onDevicesChanged() {
      onActiveOutputChange('internal');
      onActiveClockOutputChange('none');
      onActiveClockInputChange('none');
    }

    function onActiveOutputChange(id) {
      if (activeOutput !== 'internal') {
        outputs[activeOutput] = null;
      }
      activeOutput = id;
      if (activeOutput !== 'internal') {
        let output = WebMidi.getOutputById(id);
        outputs[id] = {
          play: (drumIdx, velo, time) => {
            let delay = (time - Tone.now()) * 1000;
            let duration = (oneEighth / 2) * 1000;
            let velocity = { high: 1, med: 0.75, low: 0.5 };
            output.playNote(midiDrums[drumIdx], 1, {
              time: delay > 0 ? `+${delay}` : WebMidi.now,
              velocity,
              duration
            });
          }
        };
      }
    }

    function onActiveClockOutputChange(id) {
      if (activeClockOutput !== 'none') {
        stopSendingMidiClock();
      }
      activeClockOutput = id;
      if (activeClockOutput !== 'none') {
        startSendingMidiClock();
      }
    }

    function startSendingMidiClock() {
      let output = WebMidi.getOutputById(activeClockOutput);
      midiClockSender = function(time, stepCounter) {
        let startDelay = time - Tone.now() + Tone.context.lookAhead;
        let sixteenth = Tone.Time('16n').toSeconds();
        for (let i = 0; i < 6; i++) {
          let tickDelay = startDelay + (sixteenth / 6) * i;
          if (i === 0 && stepCounter === 0 && !midiClockStartSent) {
            console.log('sending clock start');
            output.sendStart({ time: `+${tickDelay * 1000}` });
            midiClockStartSent = true;
          }
          output.sendClock({ time: `+${tickDelay * 1000}` });
        }
      };
    }

    function stopSendingMidiClock() {
      midiClockSender = null;
      midiClockStartSent = false;
    }

    function incomingMidiClockStart() {
      midiClockCounter = 0;
      eighthsCounter = 0;
      startPattern();
    }

    function incomingMidiClockStop() {
      midiClockCounter = 0;
      eighthsCounter = 0;
      lastEighthAt = null;
      stopPattern();
    }

    function incomingMidiClockTick(evt) {
      if (midiClockCounter % 6 === 0) {
        tick();
      }
      if (eighthsCounter % 12 === 0) {
        if (lastEighthAt) {
          oneEighth = (evt.timestamp - lastEighthAt) / 1000;
        }
        lastEighthAt = evt.timestamp;
      }
      midiClockCounter++;
      eighthsCounter++;
    }

    function onActiveClockInputChange(id) {
      if (activeClockInput === 'none') {
        Tone.Transport.clear(currentSchedulerId);
        currentSchedulerId = null;
      } else if (activeClockInput) {
        let input = WebMidi.getInputById(activeClockInput);
        input.removeListener('start', 'all', incomingMidiClockStart);
        input.removeListener('stop', 'all', incomingMidiClockStop);
        input.removeListener('clock', 'all', incomingMidiClockTick);
      }
      activeClockInput = id;
      if (activeClockInput === 'none') {
        currentSchedulerId = Tone.Transport.scheduleRepeat(tick, '16n');
        oneEighth = Tone.Time('8n').toSeconds();
      } else {
        let input = WebMidi.getInputById(id);
        input.addListener('start', 'all', incomingMidiClockStart);
        input.addListener('stop', 'all', incomingMidiClockStop);
        input.addListener('clock', 'all', incomingMidiClockTick);
      }
    }

    onDevicesChanged();
    WebMidi.addListener('connected', onDevicesChanged);
    WebMidi.addListener('disconnected', onDevicesChanged);
  });
  renderPattern();
  document.querySelector('.progress').remove();
  document.querySelector('.app').style.display = null;
    $.ajax({
        url: 'demo/demo_init.js',
        dataType: 'text',
        success: function(data) {
            editor.insert(data);
        }
    });
  renderSeedWindow(state.pattern.slice(0,4));
});


function toNoteSequence(pattern) {
  return mm.sequences.quantizeNoteSequence(
      {
        ticksPerQuarter: 220,
        totalTime: pattern.length / 2,
        timeSignatures: [
          {
            time: 0,
            numerator: 4,
            denominator: 4
          }
        ],
        tempos: [
          {
            time: 0,
            qpm: 120
          }
        ],
        notes: _.flatMap(pattern, (step, index) =>
            step.map(d => ({
              pitch: midiDrums[d],
              startTime: index * 0.5,
              endTime: (index + 1) * 0.5
            }))
        )
      },
      1
  );
}

function fromNoteSequence(seq, patternLength) {
  let res = _.times(patternLength, () => []);
  for (let { pitch, quantizedStartStep } of seq.notes) {
    res[quantizedStartStep].push(reverseMidiMapping.get(pitch));
  }
  return res;
}

function getStepVelocity(step) {
  if (step % 4 === 0) {
    return 'high';
  } else if (step % 2 === 0) {
    return 'med';
  } else {
    return 'low';
  }
}

function humanizeTime(time) {
  return time - TIME_HUMANIZATION / 2 + Math.random() * TIME_HUMANIZATION;
}

function visualizePlay(time, stepIdx, drumIdx) {
  Tone.Draw.schedule(() => {
    if (!stepEls[stepIdx]) return;
    let animTime = oneEighth * 4 * 1000;
    let cellEl = stepEls[stepIdx].cellEls[drumIdx];
    if (cellEl.classList.contains('on')) {
      let baseColor = stepIdx < state.seedLength ? '#FF7877' : '#4589F4';
      cellEl.animate(
          [
            {
              transform: 'translateZ(-100px)',
              backgroundColor: '#fad1df'
            },
            {
              transform: 'translateZ(50px)',
              offset: 0.7
            },
            { transform: 'translateZ(0)', backgroundColor: baseColor }
          ],
          { duration: animTime, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
      );
    }
  }, time);
}

function tick(time = Tone.now() - Tone.context.lookAhead) {
  if (_.isNumber(stepCounter) && state.pattern) {
    stepCounter++;
    if (midiClockSender) midiClockSender(time, stepCounter);

    let stepIdx = stepCounter % state.pattern.length;
    let isSwung = stepIdx % 2 !== 0;
    if (isSwung) {
      time += (state.swing - 0.5) * oneEighth;
    }
    let velocity = getStepVelocity(stepIdx);
    let drums = state.pattern[stepIdx];
    drums.forEach(d => {
      let humanizedTime = stepIdx === 0 ? time : humanizeTime(time);
      outputs[activeOutput].play(d, velocity, humanizedTime);
      visualizePlay(humanizedTime, stepIdx, d);
    });
  }
}

function toggleStep(cellEl) {
  if (state.pattern && cellEl.classList.contains('cell')) {
    let stepIdx = +cellEl.dataset.stepIdx;
    let cellIdx = +cellEl.dataset.cellIdx;
    let isOn = cellEl.classList.contains('on');
    if (isOn) {
      _.pull(state.pattern[stepIdx], cellIdx);
      cellEl.classList.remove('on');
    } else {
      state.pattern[stepIdx].push(cellIdx);
      cellEl.classList.add('on');
    }
    console.log(state.pattern.slice(0,4));
  }
}

function doSave(value, type, name) {
  let blob;
  if (typeof window.Blob == "function") {
    blob = new Blob([value], {type: type});
  } else {
    let BlobBuilder = window.BlobBuilder || window.MozBlobBuilder || window.WebKitBlobBuilder || window.MSBlobBuilder;
    let bb = new BlobBuilder();
    bb.append(value);
    blob = bb.getBlob(type);
  }
  let URL = window.URL || window.webkitURL;
  let bloburl = URL.createObjectURL(blob);
  let anchor = document.createElement("a");
  if ('download' in anchor) {
    anchor.style.visibility = "hidden";
    anchor.href = bloburl;
    anchor.download = name;
    document.body.appendChild(anchor);
    let evt = document.createEvent("MouseEvents");
    evt.initEvent("click", true, true);
    anchor.dispatchEvent(evt);
    document.body.removeChild(anchor);
  } else if (navigator.msSaveBlob) {
    navigator.msSaveBlob(blob, name);
  } else {
    location.href = bloburl;
  }
}

function removeByValue(arr, val) {
  for(let i = 0; i < arr.length; i++) {
    if(arr[i] == val) {
      arr.splice(i, 1);
      break;
    }
  }
}


function updatePlayPauseIcons() {
  if (_.isNumber(stepCounter)) {
    document.querySelector('.playpause .pause-icon').style.display = null;
    document.querySelector('.playpause .play-icon').style.display = 'none';
  } else {
    document.querySelector('.playpause .play-icon').style.display = null;
    document.querySelector('.playpause .pause-icon').style.display = 'none';
  }
}

function repositionRegenerateButton() {
  let regenButton = document.querySelector('.regenerate');
  let sequencerEl = document.querySelector('.sequencer');
  let seedMarkerEl = document.querySelector('.gutter.seed-marker');
  let regenLeft =
      sequencerEl.offsetLeft +
      seedMarkerEl.offsetLeft +
      seedMarkerEl.offsetWidth / 2 -
      regenButton.offsetWidth / 2;
  let regenTop =
      sequencerEl.offsetTop +
      seedMarkerEl.offsetTop +
      seedMarkerEl.offsetHeight / 2 -
      regenButton.offsetHeight / 2;
  regenButton.style.left = `${regenLeft}px`;
  regenButton.style.top = `${regenTop}px`;
  regenButton.style.visibility = 'visible';
}

function renderSeedWindow(seed) {
  let seed_parent = document.querySelector('.seed_content').children;
  for(let i = 0; i < seed_parent.length; i++){
    let row_parent = seed_parent[i].children;
    for(let j = 0; j < row_parent.length; j++){
      if(row_parent[j].classList.contains('seed_col')){
        row_parent[j].setAttribute('x', i);
        row_parent[j].setAttribute('y', j - 1);
        if(row_parent[j].classList.contains('seed_col_active')){
          row_parent[j].classList.remove('seed_col_active');
        }
      }
    }
  }
  for(let i = 0; i < seed.length; i++){
    for(let j = 0; j < seed[i].length; j++){
      seed_parent[seed[i][j]].children[i+1].classList.add('seed_col_active');
    }
  }
}


function startPattern() {
  stepCounter = -1;
  midiClockStartSent = false;
  updatePlayPauseIcons();
}

function stopPattern() {
  stepCounter = null;
  updatePlayPauseIcons();
}

function generatePattern(seed, length) {
  let seedSeq = toNoteSequence(seed);
  return rnn
      .continueSequence(seedSeq, length, temperature)
      .then(r => seed.concat(fromNoteSequence(r, length)));
}

function renderPattern(regenerating = false) {
  let seqEl = document.querySelector('.sequencer .steps');
  while (stepEls.length > state.pattern.length) {
    let { stepEl, gutterEl } = stepEls.pop();
    stepEl.remove();
    if (gutterEl) gutterEl.remove();
  }
  for (let stepIdx = 0; stepIdx < state.pattern.length; stepIdx++) {
    let step = state.pattern[stepIdx];
    let stepEl, gutterEl, cellEls;
    if (stepEls[stepIdx]) {
      stepEl = stepEls[stepIdx].stepEl;
      gutterEl = stepEls[stepIdx].gutterEl;
      cellEls = stepEls[stepIdx].cellEls;
    } else {
      stepEl = document.createElement('div');
      stepEl.classList.add('step');
      stepEl.dataset.stepIdx = stepIdx;
      seqEl.appendChild(stepEl);
      cellEls = [];
    }

    stepEl.style.flex = stepIdx % 2 === 0 ? state.swing : 1 - state.swing;

    if (!gutterEl && stepIdx < state.pattern.length - 1) {
      gutterEl = document.createElement('div');
      gutterEl.classList.add('gutter');
      seqEl.insertBefore(gutterEl, stepEl.nextSibling);
    } else if (gutterEl && stepIdx >= state.pattern.length) {
      gutterEl.remove();
      gutterEl = null;
    }

    if (gutterEl && stepIdx === state.seedLength - 1) {
      gutterEl.classList.add('seed-marker');
    } else if (gutterEl) {
      gutterEl.classList.remove('seed-marker');
    }

    for (let cellIdx = 0; cellIdx < DRUM_CLASSES.length; cellIdx++) {
      let cellEl;
      if (cellEls[cellIdx]) {
        cellEl = cellEls[cellIdx];
      } else {
        cellEl = document.createElement('div');
        cellEl.classList.add('cell');
        cellEl.classList.add(_.kebabCase(DRUM_CLASSES[cellIdx]));
        cellEl.dataset.stepIdx = stepIdx;
        cellEl.dataset.cellIdx = cellIdx;
        stepEl.appendChild(cellEl);
        cellEls[cellIdx] = cellEl;
      }
      if (step.indexOf(cellIdx) >= 0) {
        cellEl.classList.add('on');
      } else {
        cellEl.classList.remove('on');
      }
    }
    stepEls[stepIdx] = { stepEl, gutterEl, cellEls };

    let stagger = stepIdx * (300 / (state.patternLength - state.seedLength));
    setTimeout(() => {
      if (stepIdx < state.seedLength) {
        stepEl.classList.add('seed');
      } else {
        stepEl.classList.remove('seed');
        if (regenerating) {
          stepEl.classList.add('regenerating');
        } else {
          stepEl.classList.remove('regenerating');
        }
      }
    }, stagger);
  }

  setTimeout(repositionRegenerateButton, 0);
}

function regenerate() {
  let seed = _.take(state.pattern, state.seedLength);
  renderPattern(true);
  return generatePattern(seed, state.patternLength - seed.length).then(
      result => {
        state.pattern = result;
        onPatternUpdated();
      }
  );
}

function onPatternUpdated() {
  stopPattern();
  renderPattern();
}


function setPatternLength(newPatternLength) {
  if (newPatternLength < state.patternLength) {
    state.pattern.length = newPatternLength;
  } else {
    for (let i = state.pattern.length; i < newPatternLength; i++) {
      state.pattern.push([]);
    }
  }
  let lengthRatio = newPatternLength / state.patternLength;
  state.seedLength = Math.max(
      1,
      Math.min(newPatternLength - 1, Math.round(state.seedLength * lengthRatio))
  );
  state.patternLength = newPatternLength;
  onPatternUpdated();
  if (Tone.Transport.state === 'started') {
    startPattern();
  }
}

function setTempo(newTempo) {
  Tone.Transport.bpm.value = state.tempo = +newTempo;
  oneEighth = Tone.Time('8n').toSeconds();
}

function setSwing(newSwing) {
  state.swing = newSwing;
  renderPattern();
}

function setTemperature(newTemperature) {
  temperature = newTemperature;
}

function setSeed(newSeed) {
  state.pattern = newSeed.concat(_.times(32, i => []));
  seed_input = newSeed;
}


window.addEventListener('resize', repositionRegenerateButton);

document.querySelector('.app').addEventListener('click', event => {
  if (event.target.classList.contains('cell')) {
    toggleStep(event.target);
  }
});
document.querySelector('.regenerate').addEventListener('click', event => {
  event.preventDefault();
  event.currentTarget.classList.remove('pulse');
  document.querySelector('.playpause').classList.remove('pulse');
  regenerate().then(() => {
    if (!hasBeenStarted) {
      Tone.context.resume();
      Tone.Transport.start();
      hasBeenStarted = true;
    }
    if (Tone.Transport.state === 'started') {
      setTimeout(startPattern, 0);
    }
  });
});
document.querySelector('.playpause').addEventListener('click', event => {
  event.preventDefault();
  document.querySelector('.playpause').classList.remove('pulse');
  if (_.isNumber(stepCounter)) {
    stopPattern();
    Tone.Transport.pause();
  } else {
    Tone.context.resume();
    Tone.Transport.start();
    startPattern();
    hasBeenStarted = true;
  }
});

let draggingSeedMarker = false;
document.querySelector('.app').addEventListener('mousedown', evt => {
  let el = evt.target;
  if (
      el.classList.contains('gutter') &&
      el.classList.contains('seed-marker')
  ) {
    draggingSeedMarker = true;
    evt.preventDefault();
  }
});
document.querySelector('.app').addEventListener('mouseup', () => {
  draggingSeedMarker = false;
});
document.querySelector('.app').addEventListener('mouseover', evt => {
  if (draggingSeedMarker) {
    let el = evt.target;
    while (el) {
      if (el.classList.contains('step')) {
        let stepIdx = +el.dataset.stepIdx;
        if (stepIdx > 0) {
          state.seedLength = stepIdx;
          renderPattern();
        }
        break;
      }
      el = el.parentElement;
    }
  }
});

document.querySelector('#swing').addEventListener('input', evt => setSwing(+evt.target.value));
document.querySelector('#tempo').addEventListener('input', evt => setTempo(+evt.target.value));
document.querySelector('#temperature')
    .addEventListener('input', evt => setTemperature(+evt.target.value));

document.querySelector('#new_page').addEventListener('click', () => {
  document.querySelector('.light_window').style.display='block';
  document.querySelector('.dark_window').style.display='block';
});
document.querySelector('#close_page').addEventListener('click', () => {
  document.querySelector('.light_window').style.display='none';
  document.querySelector('.dark_window').style.display='none';
});
document.querySelectorAll('.right-control').forEach(e => e.addEventListener('mouseenter', evt => {
  let el = evt.target;
  if(el.querySelector('.right-control-description')){
    el.querySelector('.right-control-description').style.display='block';
  }
}, false));
document.querySelectorAll('.right-control').forEach(e => e.addEventListener('mouseleave', evt => {
  let el = evt.target;
  if(el.querySelector('.right-control-description')){
    el.querySelector('.right-control-description').style.display='none';
  }
},false));
$('#pattern-length').on('change', evt => setPatternLength(+evt.target.value)).formSelect();

let file_count = 0;
document.querySelector('#run_code').addEventListener('click', evt => {
  let el = evt.target;
  let final_code = editor.getValue();
  if(document.querySelector('#trick')){
    document.body.removeChild(document.querySelector('#trick'));
  }
  let trick = document.createElement('script')
  trick.setAttribute('id','#trick');
  trick.innerHTML = final_code;
  document.body.appendChild(trick);
  document.querySelectorAll('.btn_left').forEach(e => {
    e.classList.remove('active')
  });
  el.classList.add('active');
});
document.querySelector('#save_code').addEventListener('click', evt => {
  let el = evt.target;
  let final_code = editor.getValue();
  let filename = "demo" + file_count + ".js";
  file_count = file_count + 1;
  doSave(final_code, "text/latex", filename);
  document.querySelectorAll('.btn_left').forEach(e => {
    e.classList.remove('active')
  });
  el.classList.add('active')
});
document.querySelector('#load_code').addEventListener('click', evt => {
  let el = evt.target;
  let inputObj=document.createElement('input')
  inputObj.setAttribute('id','_ef');
  inputObj.setAttribute('type','file');
  inputObj.setAttribute("style",'visibility:hidden');
  document.body.appendChild(inputObj);
  inputObj.addEventListener('change', evt => {
    let reader = new FileReader();
    reader.onload = function () {
      let code = this.result;
      editor.setValue(code);
    };
    reader.readAsText(evt.target.files[0]);

  });
  inputObj.click();
  document.body.removeChild(inputObj);
  document.querySelectorAll('.btn_left').forEach(e => {
    e.classList.remove('active')
  });
  el.classList.add('active')
});
document.querySelector('#seed_btn').addEventListener('click', evt => {
  document.querySelector('.light_window').style.display='none';
  document.querySelector('.seed_window').style.display='block';
  renderSeedWindow(state.pattern.slice(0,4));
});
document.querySelector('#close_seed').addEventListener('click', evt => {
  document.querySelector('.light_window').style.display='block';
  document.querySelector('.seed_window').style.display='none';
  state.pattern = seed_input.concat(_.times(32, i => []));
  renderPattern();
});
document.querySelectorAll('.seed_col').forEach(e => e.addEventListener('click', evt => {
  let el = evt.target;
  if(!el.classList.contains('seed_col_active')){
    el.classList.add('seed_col_active');
    seed_input[parseInt(el.getAttribute('y'))].push(parseInt(el.getAttribute('x')));
  }
  else{
    el.classList.remove('seed_col_active');
    removeByValue(seed_input[parseInt(el.getAttribute('y'))], parseInt(el.getAttribute('x')))
  }
},false));






