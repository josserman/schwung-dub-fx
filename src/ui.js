/*
 * Dub FX Module UI — v2 Architecture
 *
 * 32 unified punch-in FX pads (hold=on, release=off)
 * Shift+hold = latch, Shift+hold latched = unlatch
 * Mix-first banked dub desk.
 * Row buttons switch banks, shift+row toggles iso kills.
 */

import {
    Black, White, LightGrey, DarkGrey,
    BrightRed, OrangeRed, Bright, VividYellow,
    BrightGreen, ForestGreen, NeonGreen, TealGreen, Cyan,
    AzureBlue, RoyalBlue, Navy,
    BlueViolet, Violet, Purple, ElectricViolet,
    HotMagenta, NeonPink, Rose, BrightPink,
    Ochre, BurntOrange, Mustard,
    MintGreen, PaleCyan, SkyBlue, LightBlue,
    Lilac, Lime,
    MidiNoteOn, MidiNoteOff, MidiCC, MidiPolyAftertouch,
    MoveShift, MoveBack, MoveMainButton, MoveMainKnob,
    MoveKnob1, MoveKnob2, MoveKnob3, MoveKnob4,
    MoveKnob5, MoveKnob6, MoveKnob7, MoveKnob8,
    MoveMaster, MovePads, MoveSteps,
    MoveCapture, MoveUndo, MoveLoop, MoveCopy, MoveDelete,
    MovePlay, MoveRec,
    MoveRow1, MoveRow2, MoveRow3, MoveRow4,
    WhiteLedOff, WhiteLedDim, WhiteLedMedium, WhiteLedBright,
    Pulse4th
} from '/data/UserData/schwung/shared/constants.mjs';

import {
    isCapacitiveTouchMessage, isNoiseMessage,
    setLED, setButtonLED, decodeDelta
} from '/data/UserData/schwung/shared/input_filter.mjs';

import { announce } from '/data/UserData/schwung/shared/screen_reader.mjs';

/* ================================================================
 * Constants
 * ================================================================ */

const SCREEN_W = 128;
const SCREEN_H = 64;
const LEDS_PER_FRAME = 8;
const NUM_SLOTS = 32;

/* Pad note → slot index mapping
 * Row 4 (top):    92-99  → slots 0-7
 * Row 3:          84-91  → slots 8-15
 * Row 2:          76-83  → slots 16-23
 * Row 1 (bottom): 68-75  → slots 24-31
 */
const PAD_NOTES = [
    92, 93, 94, 95, 96, 97, 98, 99,   /* Row 4: slots 0-7 */
    84, 85, 86, 87, 88, 89, 90, 91,   /* Row 3: slots 8-15 */
    76, 77, 78, 79, 80, 81, 82, 83,   /* Row 2: slots 16-23 */
    68, 69, 70, 71, 72, 73, 74, 75    /* Row 1: slots 24-31 */
];

/* Build reverse lookup: note → slot index */
const NOTE_TO_SLOT = {};
for (let i = 0; i < NUM_SLOTS; i++) {
    NOTE_TO_SLOT[PAD_NOTES[i]] = i;
}

/* Track buttons */
const TRACK_CCS = [MoveRow1, MoveRow2, MoveRow3, MoveRow4];

/* FX Names (32) */
const FX_NAMES = [
    /* Top row: desk controls */
    'HIGH', 'MID', 'LOW', 'DUB',
    'CTRL 5', 'CTRL 6', 'CTRL 7', 'FILTER MODE',
    /* Row 2: Echo lane */
    'ECHO', 'ECHO 2', 'ECHO 3', 'ECHO 4',
    'ECHO 5', 'ECHO 6', 'ECHO 7', 'ECHO 8',
    /* Row 3: Reverb lane */
    'REVERB', 'VERB 2', 'VERB 3', 'VERB 4',
    'VERB 5', 'VERB 6', 'VERB 7', 'VERB 8',
    /* Row 4: Siren lane */
    'BUBBLE', 'SIGNAL', 'SIGNAL 2', 'SILLY',
    'PING', 'LANDING', 'SHUB', 'SHOCK'
];

/* Per-slot param names (E1-E3, indexed by slot) */
const SLOT_PARAM_NAMES = [
    /* Row 4: Time/Repeat (Speed is on E5 global) */
    ['Filter', 'Gate',   '---'],
    ['Filter', 'Gate',   '---'],
    ['Filter', 'Gate',   '---'],
    ['Filter', 'Gate',   '---'],
    ['Filter', 'Gate',   '---'],
    ['Pattern','Gate',   'Revrse'],
    ['Feedbk', 'Filter', 'Mix'],
    ['Tone',   'WowFlt', 'Mix'],
    /* Row 3: Echo (pad slots 8-15 → engine slots 16-19): Feedbk/Type/Level */
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    ['Feedbk', 'Type',   'Level'],
    /* Row 2: Reverb (pad slots 16-23 → engine slots 20-23): Size/HFD/Level */
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    ['Size',   'HFD',    'Level'],
    /* Row 1: Siren (pad slots 24-31): Rate/Depth/Vol */
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol'],
    ['Rate',   'Depth',  'Vol']
];

const ISO_LABELS = ['High', 'Mid', 'Low', 'Sub'];
const DIVISION_LABELS = ['1:1', '1/2', '1/4', '1/8', '1/16', '1/32'];
const BANK_MIX = 0;
const BANK_ECHO = 1;
const BANK_REVERB = 2;
const BANK_SIREN = 3;
const BANK_NAMES = ['MIX', 'ECHO', 'VERB', 'SIREN'];
const ECHO_SLOTS = [16, 17, 18, 19];
const REVERB_SLOTS = [20, 21, 22, 23];
const SIREN_SLOTS = [10, 11, 15];
const TOP_ROW_SLOTS = [0, 1, 2, 3, 4, 5, 6, 7];
const ECHO_PAD_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15];
const REVERB_PAD_SLOTS = [16, 17, 18, 19, 20, 21, 22, 23];
const SIREN_PAD_SLOTS = [24, 25, 26, 27, 28, 29, 30, 31];
const PAD_SLOT_TO_FX_SLOT = new Array(NUM_SLOTS).fill(-1);
PAD_SLOT_TO_FX_SLOT[8] = 16;
PAD_SLOT_TO_FX_SLOT[16] = 20;
PAD_SLOT_TO_FX_SLOT[24] = 24;
PAD_SLOT_TO_FX_SLOT[25] = 25;
PAD_SLOT_TO_FX_SLOT[26] = 26;
PAD_SLOT_TO_FX_SLOT[27] = 27;
PAD_SLOT_TO_FX_SLOT[28] = 28;
PAD_SLOT_TO_FX_SLOT[29] = 29;
PAD_SLOT_TO_FX_SLOT[30] = 30;
PAD_SLOT_TO_FX_SLOT[31] = 31;
const TRACK_BANKS = [BANK_MIX, BANK_ECHO, BANK_REVERB, BANK_SIREN];
const KNOB_COLUMN_X = [0, 32, 64, 96];
const MIDIMIX_SPACE_SLOTS = [16, 17, 18, 19, 20, 21, 22, 23];
const MIDIMIX_KNOB_ROWS = [
    [30, 31, 32, 33, 34, 35, 36, 37],
    [38, 39, 40, 41, 42, 43, 44, 45],
    [46, 47, 48, 49, 50, 51, 52, 53]
];
const MIDIMIX_FADERS = [0, 1, 2, 3, 4, 5, 6, 7];
const MIDIMIX_MASTER = 54;
const MIDIMIX_REC = [2, 3, 4, 5, 6, 7, 8, 9];
const MIDIMIX_MUTE = [12, 13, 14, 15, 16, 17, 18, 19];
const MIDIMIX_SOLO = [20, 21, 22, 23, 24, 25, 26, 27];

/* LED color mapping per slot */
const BRIGHT_COLORS = [];
const DIM_COLORS = [];

/* Row 4 (slots 0-7): Orange */
for (let i = 0; i < 8; i++) {
    BRIGHT_COLORS.push(OrangeRed);
    DIM_COLORS.push(Ochre);
}
/* Row 3 (slots 8-15): Blue */
for (let i = 0; i < 8; i++) {
    BRIGHT_COLORS.push(AzureBlue);
    DIM_COLORS.push(RoyalBlue);
}
/* Row 2 (slots 16-23): Purple */
for (let i = 0; i < 8; i++) {
    BRIGHT_COLORS.push(ElectricViolet);
    DIM_COLORS.push(Violet);
}
/* Row 1 (slots 24-31): grouped by function */
/* Crush/Downsample/Saturate (24-26): Pink */
for (let i = 0; i < 3; i++) {
    BRIGHT_COLORS.push(BrightPink);
    DIM_COLORS.push(Rose);
}
/* Gate/Tremolo (27-28): Green */
for (let i = 0; i < 2; i++) {
    BRIGHT_COLORS.push(BrightGreen);
    DIM_COLORS.push(ForestGreen);
}
/* Pitch Down/Vinyl Sim/Vinyl Brake (29-31): Yellow */
for (let i = 0; i < 3; i++) {
    BRIGHT_COLORS.push(VividYellow);
    DIM_COLORS.push(Mustard);
}

/* Persistence paths */
const STATE_DIR = '/data/UserData/schwung/perf_fx_state';

/* ================================================================
 * State
 * ================================================================ */

let shiftHeld = false;
let bypassed = false;
let undoHeld = false;
let undoWasBypassed = false;

/* FX state */
let fxActive = new Array(NUM_SLOTS).fill(false);
let fxLatched = new Array(NUM_SLOTS).fill(false);
let fxHeld = new Array(NUM_SLOTS).fill(false); /* physically held (finger on pad) */
/* Per-slot param values (3 per slot, 0.0-1.0)
 * Repeat slots (0-7): filter=center, gate=off, unused
 * All others: 0.5 matches pre-knob behavior */
let slotParams = [];
for (let i = 0; i < NUM_SLOTS; i++) {
    if (i < 8) slotParams.push([0.5, 0.0, 0.5]);  /* repeat: gate off */
    else slotParams.push([0.5, 0.5, 0.5]);          /* others: neutral */
}
/* Last touched slot for E1-E3 mapping */
let lastTouchedSlot = -1;
/* Last repeat slot used (for step button toggle) */
let lastRepeatSlot = 0; /* default to RPT 1/4 (slot 0) */
let activeBank = BANK_MIX;
let heldFxBank = -1;
let echoDivisionValue = 0.4;
let filterCutoffValue = 0.8;
let repeatSpeedValue = 0.5;
let tiltEqValue = 0.5;

/* Siren file browser */
let sirenAssignMode = false;
let sirenAssignPadSlot = -1;
let sirenAssignFiles = [];
let sirenAssignIdx = 0;

/* Spring IR browser */
let springAssignMode = false;
let springAssignFiles = [];
let springAssignIdx = 0;

/* Track routing */
let trackRouted = [false, false, false, false];

/* Display overlay */
let overlayText = '';
let overlayParam = '';
let overlayValue = '';
let overlayTimer = 0;
const OVERLAY_DURATION = 66;

/* Throttle screen reader announce to prevent D-Bus flood on rapid knob turns */
let lastAnnounceTime = 0;
const ANNOUNCE_THROTTLE_MS = 150;

/* LED init */
let ledInitPending = true;
let ledInitIndex = 0;

/* BPM and tap tempo */
let bpm = 120.0;
let tapTimes = [];
const TAP_TIMEOUT = 2000;
const TAP_MIN_TAPS = 2;

/* Audio source */
let audioSource = 1; /* Always Move Mix */

/* Persistence */
let autosaveCounter = 0;
let syncCounter = 0;
const AUTOSAVE_INTERVAL = 440;
let currentSetUUID = '';
let stateLoaded = false;
let isoValues = [1.0, 1.0, 1.0, 1.0];
let isoRestoreValues = [1.0, 1.0, 1.0, 1.0];
let dryWetValue = 1.0;
let filterMode = 0; /* 0=LPF, 1=HPF */

/* ================================================================
 * Persistence
 * ================================================================ */

function getStatePath() {
    if (currentSetUUID) {
        return `/data/UserData/schwung/set_state/${currentSetUUID}/perf_fx_state.json`;
    }
    return `${STATE_DIR}/perf_fx_state.json`;
}

function saveState() {
    /* State persistence disabled for now */
}

function loadState() {
    try {
        const path = getStatePath();
        const raw = host_read_file(path);
        if (!raw) return false;

        const fullState = JSON.parse(raw);
        const state = fullState.ui;
        if (!state || ![2, 3, 4, 5, 6, 7, 8].includes(state.version)) return false;

        if (state.fxLatched) fxLatched = state.fxLatched;
        if (state.version >= 8) {
            /* State loading is best-effort only for older experiments. */
            if (state.globalValues && state.globalValues.length > 0) {
                echoDivisionValue = state.globalValues[0] || echoDivisionValue;
            }
            if (state.slotParams && state.slotParams.length >= NUM_SLOTS) {
                slotParams = state.slotParams;
            }
            if (state.lastTouchedSlot !== undefined) {
                lastTouchedSlot = state.lastTouchedSlot;
            }
            if (state.lastRepeatSlot !== undefined) {
                lastRepeatSlot = state.lastRepeatSlot;
            }
        }
        /* audioSource always 1 (Move Mix), trackRouted unused */
        if (state.bpm !== undefined) bpm = state.bpm;

        /* Push restored state to DSP */
        sendParam('bpm', String(bpm));
        sendParam('audio_source', '1'); /* Always Move Mix */

        sendParam('echo_division', echoDivisionValue.toFixed(3));
        sendParam('repeat_speed', repeatSpeedValue.toFixed(3));
        sendParam('dj_filter', filterCutoffValue.toFixed(3));

        /* Restore per-slot params */
        for (let i = 0; i < NUM_SLOTS; i++) {
            for (let j = 0; j < 3; j++) {
                sendParam(`punch_${i}_param_${j}`, slotParams[i][j].toFixed(3));
            }
        }

        /* Restore latched FX */
        for (let i = 0; i < NUM_SLOTS; i++) {
            if (fxLatched[i]) {
                sendParam(`punch_${i}_on`, '0.700');
                sendParam(`punch_${i}_latch`, '1');
                fxActive[i] = true;
            }
        }

        /* Restore DSP state if available */
        if (fullState.dsp) {
            sendParam('restore_state', fullState.dsp);
        }

        return true;
    } catch (e) {
        return false;
    }
}

function detectSetUUID() {
    try {
        const raw = host_read_file('/data/UserData/schwung/active_set.txt');
        if (raw) {
            const lines = raw.split('\n');
            if (lines[0] && lines[0].length > 8) {
                currentSetUUID = lines[0].trim();
            }
        }
    } catch (e) {
        /* ignore */
    }
}

/* ================================================================
 * Tap Tempo
 * ================================================================ */

function handleTapTempo() {
    const now = Date.now();

    if (tapTimes.length > 0 && (now - tapTimes[tapTimes.length - 1]) > TAP_TIMEOUT) {
        tapTimes = [];
    }

    tapTimes.push(now);
    if (tapTimes.length > 8) tapTimes.shift();

    if (tapTimes.length >= TAP_MIN_TAPS) {
        let totalInterval = 0;
        for (let i = 1; i < tapTimes.length; i++) {
            totalInterval += tapTimes[i] - tapTimes[i - 1];
        }
        const avgInterval = totalInterval / (tapTimes.length - 1);
        const tapBpm = 60000.0 / avgInterval;

        if (tapBpm >= 20 && tapBpm <= 300) {
            bpm = Math.round(tapBpm * 10) / 10;
            sendParam('bpm', bpm.toFixed(1));
            showOverlay('Tap Tempo', `${bpm.toFixed(1)} BPM`, (bpm / 300).toFixed(2));
        }
    } else {
        showOverlay('Tap Tempo', 'Tap again...', '');
    }
}

/* ================================================================
 * LED Management
 * ================================================================ */

function getPadColor(slot) {
    if (slot >= 0 && slot <= 3) {
        return isoValues[slot] > 0.01 ? BrightGreen : BrightRed;
    }
    if (slot === 7) {
        return filterMode === 0 ? BrightGreen : AzureBlue;
    }
    if ((slot >= 4 && slot <= 6) || (slot >= 9 && slot <= 15) || (slot >= 17 && slot <= 23) || (slot >= 27 && slot <= 31)) {
        return DarkGrey;
    }
    if (fxLatched[slot]) {
        return BrightRed;
    }
    if (fxActive[slot]) {
        return BRIGHT_COLORS[slot];
    }
    return DIM_COLORS[slot];
}

function buildLedList() {
    const leds = [];

    /* All 32 pads */
    for (let i = 0; i < NUM_SLOTS; i++) {
        leds.push({
            note: PAD_NOTES[i],
            color: getPadColor(i)
        });
    }

    /* Step buttons are left off to avoid stealing focus back to native Move pages. */
    for (let i = 0; i < 16; i++) {
        leds.push({ note: MoveSteps[i], color: Black });
    }

    return leds;
}

function setupLedBatch() {
    const leds = buildLedList();
    const start = ledInitIndex;
    const end = Math.min(start + LEDS_PER_FRAME, leds.length);

    for (let i = start; i < end; i++) {
        setLED(leds[i].note, leds[i].color);
    }

    ledInitIndex = end;
    if (ledInitIndex >= leds.length) {
        ledInitPending = false;
        refreshButtonLEDs();
    }
}

function refreshPadLED(slot) {
    if (slot >= 0 && slot < NUM_SLOTS) {
        setLED(PAD_NOTES[slot], getPadColor(slot));
    }
}

function refreshAllPadLEDs() {
    for (let i = 0; i < NUM_SLOTS; i++) {
        setLED(PAD_NOTES[i], getPadColor(i));
    }
}

function refreshStepLEDs() {
    for (let i = 0; i < 16; i++) {
        setLED(MoveSteps[i], Black);
    }
}

function refreshButtonLEDs() {
    setButtonLED(MoveUndo, bypassed ? WhiteLedBright : WhiteLedDim);
    setButtonLED(MoveBack, WhiteLedDim);
    setButtonLED(MoveShift, shiftHeld ? WhiteLedBright : WhiteLedDim);
    setButtonLED(MoveLoop, filterMode ? WhiteLedBright : WhiteLedDim);
    setButtonLED(MoveCapture, WhiteLedDim);

    for (let i = 0; i < 4; i++) {
        const bank = TRACK_BANKS[i];
        const isSelected = bank === BANK_MIX ? heldFxBank < 0 : heldFxBank === bank;
        setButtonLED(TRACK_CCS[i], isSelected ? WhiteLedBright : WhiteLedDim);
    }
}

/* ================================================================
 * Display
 * ================================================================ */

function drawMainView() {
    clear_screen();

    /* Line 1: header */
    let activeCount = 0;
    for (let i = 0; i < NUM_SLOTS; i++) {
        if (fxActive[i]) activeCount++;
    }
    const bank = heldFxBank >= 0 ? heldFxBank : BANK_MIX;
    print(0, 0, `DUB ${BANK_NAMES[bank]} ${filterMode === 0 ? 'LPF' : 'HPF'}`, 1);
    draw_line(0, 9, SCREEN_W, 9, 1);

    /* Lines 2-3: names of active/latched FX */
    let activeLine1 = '';
    let activeLine2 = '';
    for (let i = 0; i < NUM_SLOTS; i++) {
        if (fxActive[i] || fxLatched[i]) {
            const name = FX_NAMES[i];
            const tag = fxLatched[i] ? '*' : '';
            const entry = name + tag;
            if (activeLine1.length === 0) {
                activeLine1 = entry;
            } else if (activeLine1.length + entry.length + 1 <= 21) {
                activeLine1 += ' ' + entry;
            } else if (activeLine2.length === 0) {
                activeLine2 = entry;
            } else if (activeLine2.length + entry.length + 1 <= 21) {
                activeLine2 += ' ' + entry;
            }
        }
    }
    if (activeLine1.length > 0) {
        print(0, 12, activeLine1, 1);
    } else {
        print(0, 12, 'No FX active', 1);
    }
    if (activeLine2.length > 0) {
        print(0, 21, activeLine2, 1);
    }

    draw_line(0, 30, SCREEN_W, 30, 1);
    print(0, 33, getKnobLabel(bank, 0), 1);
    print(32, 33, getKnobLabel(bank, 1), 1);
    print(64, 33, getKnobLabel(bank, 2), 1);
    print(96, 33, getKnobLabel(bank, 3), 1);
    print(0, 44, getKnobLabel(bank, 4), 1);
    print(32, 44, getKnobLabel(bank, 5), 1);
    print(64, 44, getKnobLabel(bank, 6), 1);
    print(96, 44, getKnobLabel(bank, 7), 1);
    print(0, 55, `${bpm.toFixed(0)} BPM`, 1);
    print(52, 55, `FX ${activeCount}`, 1);

    /* Bypass overlay */
    if (bypassed) {
        draw_rect(30, 16, 68, 14, 1);
        fill_rect(31, 17, 66, 12, 0);
        print(38, 19, 'BYPASSED', 1);
    }
}

function drawOverlay() {
    if (overlayTimer <= 0) return;

    clear_screen();
    print(0, 0, overlayText, 1);
    draw_line(0, 10, SCREEN_W, 10, 1);

    print(0, 16, overlayParam, 1);

    const isNumeric = /^-?\d+(\.\d+)?$/.test(overlayValue);
    let numVal = parseFloat(overlayValue);
    if (isNumeric && !isNaN(numVal)) {
        let barWidth = Math.floor(numVal * 110);
        if (barWidth < 0) barWidth = 0;
        if (barWidth > 110) barWidth = 110;
        fill_rect(8, 30, barWidth, 10, 1);
        draw_rect(8, 30, 110, 10, 1);
        let pct = Math.round(numVal * 100);
        print(50, 45, `${pct}%`, 1);
    } else {
        print(0, 30, overlayValue, 1);
    }

    overlayTimer--;
}

/* ================================================================
 * Rate label helper (maps 0..1 to musical division name)
 * ================================================================ */

function drawFileBrowser() {
    clear_screen();
    const padNum = sirenAssignPadSlot - 24 + 1;
    print(0, 0, `ASSIGN PAD ${padNum}`, 1);
    draw_line(0, 10, SCREEN_W, 10, 1);

    if (sirenAssignFiles.length === 0) {
        print(0, 16, 'No files found', 1);
        print(0, 28, 'Back: exit', 1);
        return;
    }

    const total = sirenAssignFiles.length;
    const idx = sirenAssignIdx;
    /* Show up to 3 items with selection highlighted */
    const startIdx = Math.max(0, Math.min(idx - 1, total - 3));
    const endIdx = Math.min(total - 1, startIdx + 2);

    for (let i = startIdx; i <= endIdx; i++) {
        const y = 14 + (i - startIdx) * 13;
        const name = sirenAssignFiles[i].replace(/\.wav$/i, '');
        const truncated = name.length > 19 ? name.substring(0, 18) + '~' : name;
        if (i === idx) {
            fill_rect(0, y - 1, 128, 12, 1);
            print(2, y, truncated, 0);
        } else {
            print(2, y, truncated, 1);
        }
    }
    print(0, 55, `${idx + 1}/${total}  CLK=LOAD BCK=EXIT`, 1);
}

function enterSirenAssignMode(slot) {
    sirenAssignPadSlot = slot;
    sirenAssignIdx = 0;
    try {
        const names = getParam('siren_names');
        sirenAssignFiles = (names && names.length > 0)
            ? names.split('\n').filter(s => s.length > 0)
            : [];
    } catch (_) {
        sirenAssignFiles = [];
    }
    sirenAssignMode = true;
}

function exitSirenAssignMode() {
    sirenAssignMode = false;
    sirenAssignPadSlot = -1;
}

function drawSpringBrowser() {
    clear_screen();
    print(0, 0, 'SPRING IR', 1);
    draw_line(0, 10, SCREEN_W, 10, 1);

    if (springAssignFiles.length === 0) {
        print(0, 16, 'No IR files found', 1);
        print(0, 28, 'Add .aif files to', 1);
        print(0, 39, 'springs/ folder', 1);
        print(0, 55, 'Back: exit', 1);
        return;
    }

    const total = springAssignFiles.length;
    const idx = springAssignIdx;
    const startIdx = Math.max(0, Math.min(idx - 1, total - 3));
    const endIdx = Math.min(total - 1, startIdx + 2);

    for (let i = startIdx; i <= endIdx; i++) {
        const y = 14 + (i - startIdx) * 13;
        /* Strip .aif or .wav extension for display */
        const name = springAssignFiles[i].replace(/\.(aif|wav)$/i, '');
        const truncated = name.length > 19 ? name.substring(0, 18) + '~' : name;
        if (i === idx) {
            fill_rect(0, y - 1, 128, 12, 1);
            print(2, y, truncated, 0);
        } else {
            print(2, y, truncated, 1);
        }
    }
    print(0, 55, `${idx + 1}/${total}  CLK=LOAD BCK=EXIT`, 1);
}

function enterSpringAssignMode() {
    springAssignIdx = 0;
    try {
        const names = getParam('ir_names');
        springAssignFiles = (names && names.length > 0)
            ? names.split('\n').filter(s => s.length > 0)
            : [];
    } catch (_) {
        springAssignFiles = [];
    }
    springAssignMode = true;
}

function exitSpringAssignMode() {
    springAssignMode = false;
}

function resetRepeatKnobs(slot) {
    /* Reset filter to center (bypass), gate to off, speed to normal */
    slotParams[slot][0] = 0.5;  /* filter = center */
    slotParams[slot][1] = 0.0;  /* gate = off */
    sendParam(`punch_${slot}_param_0`, '0.500');
    sendParam(`punch_${slot}_param_1`, '0.000');
    repeatSpeedValue = 0.5;      /* speed = normal */
    sendParam('repeat_speed', '0.500');
}

function bpmSyncedRate(slot) {
    /* Convert BPM-synced beat division to rate01 position (free seconds).
     * Matches DSP: seconds = 2.0 * 0.006^rate01
     * Inverse: rate01 = ln(seconds/2.0) / ln(0.006) */
    const beatSec = 60.0 / (bpm > 20 ? bpm : 120);
    const divMap = [1.0, 0.5, 0.25, 2.0/3.0, 0.125]; /* 1/4, 1/8, 1/16, trip, 1/32 */
    const seconds = beatSec * (divMap[slot] || 0.5);
    if (seconds >= 2.0) return 0.0;
    if (seconds <= 0.012) return 1.0;
    return Math.log(seconds / 2.0) / Math.log(0.006);
}

function getTimeLabel(rate01) {
    /* Matches DSP: seconds = 2.0 * 0.006^rate01 */
    const seconds = 2.0 * Math.pow(0.006, rate01);
    if (seconds >= 1.0) return seconds.toFixed(1) + 's';
    const ms = Math.round(seconds * 1000);
    return ms + 'ms';
}

function getDivisionIndex(value) {
    let idx = Math.round(value * 5.0);
    if (idx < 0) idx = 0;
    if (idx > 5) idx = 5;
    return idx;
}

function getDivisionValue(index) {
    let idx = index;
    if (idx < 0) idx = 0;
    if (idx > 5) idx = 5;
    return idx / 5.0;
}

function getDivisionLabel(value) {
    return DIVISION_LABELS[getDivisionIndex(value)];
}

function getKnobLabel(bank, knobIndex) {
    if (bank === BANK_ECHO) {
        return ['Time', 'Feedbk', 'Type', 'Vol', 'Warm', 'D/W', '---', 'Filt'][knobIndex];
    }
    if (bank === BANK_REVERB) {
        return ['Size', 'HFD', 'Vol', '---', '---', '---', '---', 'Filt'][knobIndex];
    }
    if (bank === BANK_SIREN) {
        return ['Rate', 'Depth', 'Vol', '---', '---', '---', '---', 'Filt'][knobIndex];
    }
    return ['High', 'Mid', 'Low', 'Sub', 'Master', 'Echo', 'Verb', 'Filt'][knobIndex];
}

function setBank(bank) {
    activeBank = bank;
    heldFxBank = bank === BANK_MIX ? -1 : bank;
    refreshButtonLEDs();
    showOverlay('Bank', BANK_NAMES[bank], '');
}

function setGroupedSlotParam(slots, paramIdx, value, title, label) {
    const v = Math.max(0.0, Math.min(1.0, value));
    for (const slot of slots) {
        slotParams[slot][paramIdx] = v;
        sendParam(`punch_${slot}_param_${paramIdx}`, v.toFixed(3));
    }
    if (slots.length > 0) {
        lastTouchedSlot = slots[0];
    }
    showOverlay(title, label, v.toFixed(2));
}

function nudgeValue(value, delta, step = 0.01) {
    let v = value + delta * step;
    if (v < 0.0) v = 0.0;
    if (v > 1.0) v = 1.0;
    return v;
}

function getSlotBank(slot) {
    if (ECHO_PAD_SLOTS.includes(slot)) return BANK_ECHO;
    if (REVERB_PAD_SLOTS.includes(slot)) return BANK_REVERB;
    if (SIREN_PAD_SLOTS.includes(slot)) return BANK_SIREN;
    return BANK_MIX;
}

function getEngineSlotForPad(slot) {
    return PAD_SLOT_TO_FX_SLOT[slot];
}

function refreshHeldFxBank() {
    for (let i = 0; i < NUM_SLOTS; i++) {
        if (!fxHeld[i]) continue;
        const bank = getSlotBank(i);
        if (bank !== BANK_MIX) {
            heldFxBank = bank;
            activeBank = bank;
            refreshButtonLEDs();
            return;
        }
    }
    /* Fall back to most-recently-touched latched non-MIX slot */
    if (lastTouchedSlot >= 0 && fxLatched[lastTouchedSlot]) {
        const lbank = getSlotBank(lastTouchedSlot);
        if (lbank !== BANK_MIX) {
            heldFxBank = lbank;
            activeBank = lbank;
            refreshButtonLEDs();
            return;
        }
    }
    for (let i = 0; i < NUM_SLOTS; i++) {
        if (!fxLatched[i]) continue;
        const lbank = getSlotBank(i);
        if (lbank !== BANK_MIX) {
            heldFxBank = lbank;
            activeBank = lbank;
            refreshButtonLEDs();
            return;
        }
    }
    /* Sticky: stay on bank of last-touched slot (handles siren one-shots) */
    if (lastTouchedSlot >= 0) {
        const lbank = getSlotBank(lastTouchedSlot);
        if (lbank !== BANK_MIX) {
            heldFxBank = lbank;
            activeBank = lbank;
            refreshButtonLEDs();
            return;
        }
    }
    heldFxBank = -1;
    activeBank = BANK_MIX;
    refreshButtonLEDs();
}

/* ================================================================
 * Parameter handling
 * ================================================================ */

/* ---- Param queue for overtake mode ----
 * In overtake mode, shadow_set_param is fire-and-forget into a single
 * shared memory slot. Rapid calls within the same tick clobber each other.
 * Queue non-critical params and drain them 1 per tick.
 * Critical params (on/off/latch) use the blocking variant. */
const paramQueue = [];
const PARAMS_PER_TICK = 2;  /* drain up to 2 queued params per tick */

function sendParam(key, value) {
    const v = String(value);
    /* Critical: note on/off/latch must be delivered immediately */
    if (key.endsWith('_on') || key.endsWith('_off') || key.endsWith('_latch')) {
        if (typeof host_module_set_param_blocking === 'function') {
            host_module_set_param_blocking(key, v, 50);
        } else {
            host_module_set_param(key, v);
        }
        return;
    }
    /* Non-critical: queue and deduplicate (keep latest value per key) */
    const existing = paramQueue.findIndex(p => p[0] === key);
    if (existing >= 0) {
        paramQueue[existing][1] = v;
    } else {
        paramQueue.push([key, v]);
    }
}

function drainParamQueue() {
    let sent = 0;
    while (paramQueue.length > 0 && sent < PARAMS_PER_TICK) {
        const [key, value] = paramQueue.shift();
        host_module_set_param(key, value);
        sent++;
    }
}

function getParam(key) {
    return host_module_get_param(key);
}

function showOverlay(title, param, value) {
    overlayText = title;
    overlayParam = param;
    overlayValue = String(value);
    overlayTimer = OVERLAY_DURATION;

    const now = Date.now();
    if (now - lastAnnounceTime >= ANNOUNCE_THROTTLE_MS) {
        lastAnnounceTime = now;
        const parts = [title, param, value].filter(s => s && s.length > 0);
        announce(parts.join(', '));
    }
}

/* ================================================================
 * MIDI input handling
 * ================================================================ */

function handlePadOn(note, velocity) {
    const slot = NOTE_TO_SLOT[note];
    if (slot === undefined) return;
    const engineSlot = getEngineSlotForPad(slot);
    const slotBank = getSlotBank(slot);

    const velNorm = (velocity / 127.0).toFixed(3);

    if (!shiftHeld) {
        if (slot >= 0 && slot <= 3) {
            toggleIsoKill(slot);
            refreshPadLED(slot);
            return;
        }
        if (slot === 7) {
            filterMode = filterMode ? 0 : 1;
            sendParam('filter_mode', String(filterMode));
            refreshPadLED(slot);
            showOverlay('Filter', filterMode === 0 ? 'LPF Mode' : 'HPF Mode', '');
            return;
        }
        if (slot >= 4 && slot <= 6) {
            showOverlay('Controls', 'Reserved', '');
            return;
        }
    }

    if (shiftHeld) {
        /* Shift+tap FX_SPRING pad (slot 23) = enter spring IR browser */
        if (slot === 23) {
            enterSpringAssignMode();
            return;
        }
        /* Shift+siren pad = enter file browser for that pad */
        if (SIREN_PAD_SLOTS.includes(slot)) {
            lastTouchedSlot = slot;
            enterSirenAssignMode(slot);
            return;
        }
        if (engineSlot < 0) {
            showOverlay(FX_NAMES[slot], 'Reserved', '');
            return;
        }
        /* Shift+pad press = latch toggle */
        if (fxLatched[slot]) {
            /* Unlatch */
            deactivateSlot(slot);
            showOverlay(FX_NAMES[slot], 'Unlatched', '');
        } else {
            /* Latch on */
            fxLatched[slot] = true;
            fxActive[slot] = true;
            lastTouchedSlot = slot;
            sendParam(`punch_${engineSlot}_on`, velNorm);
            sendParam(`punch_${engineSlot}_latch`, '1');
            showOverlay(FX_NAMES[slot], 'Latched', '');
        }
    } else {
        /* Normal tap on latched pad = select for knob editing (don't unlatch) */
        if (fxLatched[slot]) {
            lastTouchedSlot = slot;
            const names = SLOT_PARAM_NAMES[slot];
            showOverlay(FX_NAMES[slot], `${names[0]} | ${names[1]} | ${names[2]}`, '');
            refreshPadLED(slot);
            return;
        }
        if (slotBank !== BANK_MIX) {
            heldFxBank = slotBank;
            activeBank = slotBank;
            refreshButtonLEDs();
            showOverlay('Hold FX', BANK_NAMES[slotBank], '');
        }
        if (engineSlot < 0) {
            fxHeld[slot] = true;
            showOverlay(FX_NAMES[slot], 'Macro Soon', '');
            refreshPadLED(slot);
            return;
        }
        /* Normal punch-in: hold = on.
         * If already active (missed note-off), deactivate first. */
        if (fxActive[slot]) {
            deactivateSlot(slot);
        }
        fxActive[slot] = true;
        fxHeld[slot] = true;
        lastTouchedSlot = slot;
        sendParam(`punch_${engineSlot}_on`, velNorm);
    }

    refreshPadLED(slot);
}

function handlePadOff(note) {
    const slot = NOTE_TO_SLOT[note];
    if (slot === undefined) return;
    const engineSlot = getEngineSlotForPad(slot);

    fxHeld[slot] = false;

    /* If latched, pad release does nothing */
    if (fxLatched[slot]) {
        refreshHeldFxBank();
        return;
    }

    if (engineSlot < 0) {
        refreshHeldFxBank();
        refreshPadLED(slot);
        return;
    }

    /* Normal release */
    deactivateSlot(slot);
    refreshHeldFxBank();
}

/* Per-slot pressure throttle so simultaneous pad presses don't starve each other */
const lastPressureTime = new Array(NUM_SLOTS).fill(0);
const PRESSURE_THROTTLE_MS = 30; /* Don't send pressure faster than ~33Hz */

function handleAftertouch(note, pressure) {
    const slot = NOTE_TO_SLOT[note];
    if (slot === undefined) return;
    const engineSlot = getEngineSlotForPad(slot);
    if (engineSlot < 0) return;
    if (!fxActive[slot]) return;

    /* Per-slot throttle — each pad has its own timer */
    const now = Date.now();
    if (now - lastPressureTime[slot] < PRESSURE_THROTTLE_MS) return;
    lastPressureTime[slot] = now;

    sendParam(`punch_${engineSlot}_pressure`, (pressure / 127.0).toFixed(3));
}

function deactivateSlot(slot) {
    const engineSlot = getEngineSlotForPad(slot);
    fxHeld[slot] = false;
    fxLatched[slot] = false;
    fxActive[slot] = false;
    if (engineSlot >= 0) {
        sendParam(`punch_${engineSlot}_latch`, '0');
        sendParam(`punch_${engineSlot}_off`, '1');
    }
    refreshPadLED(slot);
}

function deactivateAllSlots() {
    for (let i = 0; i < NUM_SLOTS; i++) {
        deactivateSlot(i);
    }
    refreshHeldFxBank();
}

function handleStep(stepIdx, pressed) {
    void stepIdx;
    void pressed;
    /* Step buttons intentionally unused in overtake mode:
     * on current Move firmware they appear to leak through to the native UI. */
}

function setIsoBand(bandIdx, value) {
    const v = Math.max(0.0, Math.min(1.0, value));
    isoValues[bandIdx] = v;
    if (v > 0.01) isoRestoreValues[bandIdx] = v;
    const key = bandIdx === 0
        ? 'high_eq'
        : bandIdx === 1
            ? 'mid_eq'
            : bandIdx === 2
                ? 'low_eq'
                : 'sub_eq';
    sendParam(key, v.toFixed(3));
}

function toggleIsoKill(bandIdx) {
    if (isoValues[bandIdx] > 0.01) {
        isoRestoreValues[bandIdx] = isoValues[bandIdx];
        setIsoBand(bandIdx, 0.0);
        showOverlay('Isolator', `${ISO_LABELS[bandIdx]} Kill`, '0.00');
    } else {
        const restore = isoRestoreValues[bandIdx] > 0.01 ? isoRestoreValues[bandIdx] : 1.0;
        setIsoBand(bandIdx, restore);
        showOverlay('Isolator', `${ISO_LABELS[bandIdx]} Back`, isoValues[bandIdx].toFixed(2));
    }
}

function setSpaceSlotParam(slot, paramIdx, value) {
    const v = Math.max(0.0, Math.min(1.0, value));
    slotParams[slot][paramIdx] = v;
    lastTouchedSlot = slot;
    sendParam(`punch_${slot}_param_${paramIdx}`, v.toFixed(3));
    showOverlay(FX_NAMES[slot], SLOT_PARAM_NAMES[slot][paramIdx], v.toFixed(2));
}

function setLatchedSlot(slot, shouldLatch) {
    const engineSlot = getEngineSlotForPad(slot);
    if (engineSlot < 0) return;
    if (shouldLatch) {
        fxLatched[slot] = true;
        fxActive[slot] = true;
        lastTouchedSlot = slot;
        sendParam(`punch_${engineSlot}_on`, '0.700');
        sendParam(`punch_${engineSlot}_latch`, '1');
        showOverlay(FX_NAMES[slot], 'Latched', '');
    } else {
        deactivateSlot(slot);
        showOverlay(FX_NAMES[slot], 'Released', '');
    }
    refreshPadLED(slot);
}

function handleKnob(knobIndex, delta) {
    const bank = heldFxBank >= 0 ? heldFxBank : BANK_MIX;

    if (bank === BANK_MIX && knobIndex >= 0 && knobIndex <= 3) {
        const next = nudgeValue(isoValues[knobIndex], delta);
        setIsoBand(knobIndex, next);
        showOverlay('Mix', ISO_LABELS[knobIndex], next.toFixed(2));
        return;
    }

    if (bank === BANK_ECHO) {
        if (knobIndex === 0) {
            const nextIdx = getDivisionIndex(echoDivisionValue) + (delta > 0 ? 1 : delta < 0 ? -1 : 0);
            echoDivisionValue = getDivisionValue(nextIdx);
            sendParam('echo_division', echoDivisionValue.toFixed(3));
            showOverlay('Echo', 'Time', getDivisionLabel(echoDivisionValue));
            return;
        }
        if (knobIndex === 1) {
            setGroupedSlotParam(ECHO_SLOTS, 0, nudgeValue(slotParams[ECHO_SLOTS[0]][0], delta), 'Echo', 'Feedbk');
            return;
        }
        if (knobIndex === 2) {
            setGroupedSlotParam(ECHO_SLOTS, 1, nudgeValue(slotParams[ECHO_SLOTS[0]][1], delta), 'Echo', 'Type');
            return;
        }
        if (knobIndex === 3) {
            setGroupedSlotParam(ECHO_SLOTS, 2, nudgeValue(slotParams[ECHO_SLOTS[0]][2], delta), 'Echo', 'Volume');
            return;
        }
        if (knobIndex === 4) {
            const next = nudgeValue(tiltEqValue, delta);
            tiltEqValue = next;
            sendParam('tilt_eq', next.toFixed(3));
            showOverlay('Echo', 'Warmth', next.toFixed(2));
            return;
        }
        if (knobIndex === 5) {
            dryWetValue = nudgeValue(dryWetValue, delta);
            sendParam('dry_wet', dryWetValue.toFixed(3));
            showOverlay('Echo', 'Dry/Wet', dryWetValue.toFixed(2));
            return;
        }
    } else if (bank === BANK_REVERB) {
        if (knobIndex === 0) {
            setGroupedSlotParam(REVERB_SLOTS, 0, nudgeValue(slotParams[REVERB_SLOTS[0]][0], delta), 'Reverb', 'Size');
            return;
        }
        if (knobIndex === 1) {
            setGroupedSlotParam(REVERB_SLOTS, 1, nudgeValue(slotParams[REVERB_SLOTS[0]][1], delta), 'Reverb', 'HFD');
            return;
        }
        if (knobIndex === 2) {
            setGroupedSlotParam(REVERB_SLOTS, 2, nudgeValue(slotParams[REVERB_SLOTS[0]][2], delta), 'Reverb', 'Volume');
            return;
        }
        if (knobIndex === 7) {
            filterCutoffValue = nudgeValue(filterCutoffValue, delta);
            sendParam('dj_filter', filterCutoffValue.toFixed(3));
            showOverlay('Filter', filterMode === 0 ? 'LPF Cutoff' : 'HPF Cutoff', filterCutoffValue.toFixed(2));
            return;
        }
    } else if (bank === BANK_SIREN) {
        if (knobIndex === 0) {
            setGroupedSlotParam(SIREN_PAD_SLOTS.map(getEngineSlotForPad).filter(s => s >= 0), 0, nudgeValue(slotParams[24][0], delta), 'Siren', 'Rate');
            return;
        }
        if (knobIndex === 1) {
            setGroupedSlotParam(SIREN_PAD_SLOTS.map(getEngineSlotForPad).filter(s => s >= 0), 1, nudgeValue(slotParams[24][1], delta), 'Siren', 'Depth');
            return;
        }
        if (knobIndex === 2) {
            setGroupedSlotParam(SIREN_PAD_SLOTS.map(getEngineSlotForPad).filter(s => s >= 0), 2, nudgeValue(slotParams[24][2], delta), 'Siren', 'Volume');
            return;
        }
        if (knobIndex === 7) {
            filterCutoffValue = nudgeValue(filterCutoffValue, delta);
            sendParam('dj_filter', filterCutoffValue.toFixed(3));
            showOverlay('Filter', filterMode === 0 ? 'LPF Cutoff' : 'HPF Cutoff', filterCutoffValue.toFixed(2));
            return;
        }
    }

    if (knobIndex === 4) {
        dryWetValue = nudgeValue(dryWetValue, delta);
        sendParam('dry_wet', dryWetValue.toFixed(3));
        showOverlay('Mix', 'Master', dryWetValue.toFixed(2));
    } else if (knobIndex === 5) {
        setGroupedSlotParam(ECHO_SLOTS, 2, nudgeValue(slotParams[ECHO_SLOTS[0]][2], delta), 'Mix', 'Echo Send');
    } else if (knobIndex === 6) {
        setGroupedSlotParam(REVERB_SLOTS, 2, nudgeValue(slotParams[REVERB_SLOTS[0]][2], delta), 'Mix', 'Verb Send');
    } else if (knobIndex === 7) {
        filterCutoffValue = nudgeValue(filterCutoffValue, delta);
        sendParam('dj_filter', filterCutoffValue.toFixed(3));
        showOverlay('Filter', filterMode === 0 ? 'LPF Cutoff' : 'HPF Cutoff', filterCutoffValue.toFixed(2));
    }
}

function handleKnobPeek(knobNote) {
    /* Capacitive touch notes: 0=E1 .. 7=E8, 8=Master, 9=Jog */
    if (knobNote === 9) return;
    if (knobNote === 8) return; /* Master knob = volume passthrough, no peek */

    const bank = heldFxBank >= 0 ? heldFxBank : BANK_MIX;

    if (bank === BANK_MIX && knobNote >= 0 && knobNote <= 3) {
        showOverlay('Mix', ISO_LABELS[knobNote], isoValues[knobNote].toFixed(2));
        return;
    }
    if (bank === BANK_ECHO) {
        if (knobNote === 0) {
            showOverlay('Echo', 'Time', getDivisionLabel(echoDivisionValue));
            return;
        }
        if (knobNote === 1) {
            showOverlay('Echo', 'Feedbk', slotParams[ECHO_SLOTS[0]][0].toFixed(2));
            return;
        }
        if (knobNote === 2) {
            showOverlay('Echo', 'Type', slotParams[ECHO_SLOTS[0]][1].toFixed(2));
            return;
        }
        if (knobNote === 3) {
            showOverlay('Echo', 'Volume', slotParams[ECHO_SLOTS[0]][2].toFixed(2));
            return;
        }
        if (knobNote === 4) {
            showOverlay('Echo', 'Warmth', tiltEqValue.toFixed(2));
            return;
        }
        if (knobNote === 5) {
            showOverlay('Echo', 'Dry/Wet', dryWetValue.toFixed(2));
            return;
        }
    }
    if (bank === BANK_REVERB) {
        if (knobNote === 0) {
            showOverlay('Reverb', 'Size', slotParams[REVERB_SLOTS[0]][0].toFixed(2));
            return;
        }
        if (knobNote === 1) {
            showOverlay('Reverb', 'HFD', slotParams[REVERB_SLOTS[0]][1].toFixed(2));
            return;
        }
        if (knobNote === 2) {
            showOverlay('Reverb', 'Volume', slotParams[REVERB_SLOTS[0]][2].toFixed(2));
            return;
        }
    }
    if (bank === BANK_SIREN) {
        if (knobNote === 0) {
            showOverlay('Siren', 'Rate', slotParams[24][0].toFixed(2));
            return;
        }
        if (knobNote === 1) {
            showOverlay('Siren', 'Depth', slotParams[24][1].toFixed(2));
            return;
        }
        if (knobNote === 2) {
            showOverlay('Siren', 'Volume', slotParams[24][2].toFixed(2));
            return;
        }
    }

    if (knobNote === 4) {
        showOverlay('Mix', 'Master', dryWetValue.toFixed(2));
    } else if (knobNote === 5) {
        showOverlay('Mix', 'Echo Send', slotParams[ECHO_SLOTS[0]][2].toFixed(2));
    } else if (knobNote === 6) {
        showOverlay('Mix', 'Verb Send', slotParams[REVERB_SLOTS[0]][2].toFixed(2));
    } else if (knobNote === 7) {
        showOverlay('Filter', filterMode === 0 ? 'LPF Cutoff' : 'HPF Cutoff', filterCutoffValue.toFixed(2));
    }
}

function handleTrackButton(trackIdx, pressed) {
    if (trackIdx >= 0 && trackIdx <= 3) {
        if (shiftHeld) {
            if (pressed) {
                toggleIsoKill(trackIdx);
            }
        } else {
            const bank = TRACK_BANKS[trackIdx];
            if (bank === BANK_MIX) {
                if (pressed) {
                    heldFxBank = -1;
                    activeBank = BANK_MIX;
                    refreshButtonLEDs();
                    showOverlay('Hold FX', 'MIX', '');
                }
            } else {
                heldFxBank = pressed ? bank : -1;
                activeBank = heldFxBank >= 0 ? heldFxBank : BANK_MIX;
                refreshButtonLEDs();
                showOverlay('Hold FX', pressed ? BANK_NAMES[bank] : 'MIX', '');
            }
        }
        return;
    }
}

function handleJogScroll(delta) {
    /* Jog scroll adjusts BPM in coarse steps */
    bpm = Math.max(20, Math.min(300, bpm + delta * 1.0));
    sendParam('bpm', bpm.toFixed(1));
    showOverlay('Tempo', `${bpm.toFixed(1)} BPM`, (bpm / 300).toFixed(2));
}

function syncFxState() {
    try {
        const activeStr = getParam('fx_active');
        if (activeStr) {
            const active = JSON.parse(activeStr);
            for (let i = 0; i < NUM_SLOTS; i++) {
                const engineSlot = getEngineSlotForPad(i);
                fxActive[i] = engineSlot >= 0 ? active[engineSlot] === 1 : false;
            }
        }
    } catch (e) { /* ignore */ }

    try {
        const latchedStr = getParam('fx_latched');
        if (latchedStr) {
            const latched = JSON.parse(latchedStr);
            for (let i = 0; i < NUM_SLOTS; i++) {
                const engineSlot = getEngineSlotForPad(i);
                fxLatched[i] = engineSlot >= 0 ? latched[engineSlot] === 1 : false;
            }
        }
    } catch (e) { /* ignore */ }

}


/* ================================================================
 * Lifecycle
 * ================================================================ */

globalThis.init = function() {
    console.log('Dub FX v0 module initializing');

    /* State persistence disabled — always start fresh */
    sendParam('bpm', String(bpm));
    sendParam('audio_source', '1');
    sendParam('dry_wet', dryWetValue.toFixed(3));
    sendParam('high_eq', isoValues[0].toFixed(3));
    sendParam('mid_eq', isoValues[1].toFixed(3));
    sendParam('low_eq', isoValues[2].toFixed(3));
    sendParam('sub_eq', isoValues[3].toFixed(3));
    sendParam('filter_mode', String(filterMode));
    sendParam('echo_division', echoDivisionValue.toFixed(3));
    sendParam('repeat_speed', repeatSpeedValue.toFixed(3));
    sendParam('tilt_eq', tiltEqValue.toFixed(3));
    sendParam('dj_filter', filterCutoffValue.toFixed(3));

    ledInitPending = true;
    ledInitIndex = 0;
};

globalThis.tick = function() {
    if (ledInitPending) {
        setupLedBatch();
        return;
    }

    /* Drain queued params (pressure, knob values, etc.) */
    drainParamQueue();

    syncCounter++;
    if (syncCounter >= 8) {
        syncCounter = 0;
        syncFxState();
    }

    /* Autosave */
    autosaveCounter++;
    if (autosaveCounter >= AUTOSAVE_INTERVAL) {
        autosaveCounter = 0;
        saveState();
    }

    /* Render display */
    if (springAssignMode) {
        drawSpringBrowser();
    } else if (sirenAssignMode) {
        drawFileBrowser();
    } else if (overlayTimer > 0) {
        drawOverlay();
    } else {
        drawMainView();
    }
    host_flush_display();
};

globalThis.onMidiMessageInternal = function(data) {
    const status = data[0] & 0xF0;
    const d1 = data[1];
    const d2 = data[2];

    /* Filter clock and sysex noise, but NOT aftertouch or capacitive touch */
    if (data[0] === 0xF8 || data[0] === 0xF0 || data[0] === 0xF7) return;

    /* Capacitive touch on knobs (notes 0-9) = knob peek */
    if (status === 0x90 && d1 < 10 && d2 > 0) {
        handleKnobPeek(d1);
        return;
    }
    if (status === 0x80 && d1 < 10) return;

    /* Polyphonic aftertouch - pad pressure */
    if (status === 0xA0) {
        handleAftertouch(d1, d2);
        return;
    }

    /* Channel aftertouch - broadcast to all active punch-ins (throttled) */
    if (status === 0xD0) {
        const now = Date.now();
        for (let i = 0; i < NUM_SLOTS; i++) {
            if (fxActive[i] && now - lastPressureTime[i] >= PRESSURE_THROTTLE_MS) {
                const engineSlot = getEngineSlotForPad(i);
                if (engineSlot < 0) continue;
                lastPressureTime[i] = now;
                sendParam(`punch_${engineSlot}_pressure`, (d1 / 127.0).toFixed(3));
            }
        }
        return;
    }

    /* Note On */
    if (status === 0x90) {
        if (d2 > 0) {
            if (d1 >= 68 && d1 <= 99) {
                handlePadOn(d1, d2);
                return;
            }
            if (d1 >= 16 && d1 <= 31) {
                handleStep(d1 - 16, true);
                return;
            }
        } else {
            if (d1 >= 68 && d1 <= 99) {
                handlePadOff(d1);
                return;
            }
        }
    }

    /* Note Off */
    if (status === 0x80) {
        if (d1 >= 68 && d1 <= 99) {
            handlePadOff(d1);
        }
        return;
    }

    /* CC Messages */
    if (status === 0xB0) {
        /* Shift */
        if (d1 === MoveShift) {
            shiftHeld = d2 > 0;
            refreshButtonLEDs();
            return;
        }

        /* Back - exit file browser or clean exit */
        if (d1 === MoveBack && d2 > 0) {
            if (springAssignMode) {
                exitSpringAssignMode();
                return;
            }
            if (sirenAssignMode) {
                exitSirenAssignMode();
                return;
            }
            saveState();
            deactivateAllSlots();
            sendParam('bypass', '1');
            host_exit_module();
            return;
        }

        /* Undo - Bypass (tap=toggle, hold=momentary) */
        if (d1 === MoveUndo) {
            if (d2 > 0) {
                undoHeld = true;
                undoWasBypassed = bypassed;
                if (!bypassed) {
                    bypassed = true;
                    sendParam('bypass', '1');
                    refreshButtonLEDs();
                    showOverlay('FX', 'BYPASSED', '');
                } else {
                    bypassed = false;
                    sendParam('bypass', '0');
                    refreshButtonLEDs();
                    showOverlay('FX', 'ACTIVE', '');
                }
            } else {
                if (undoHeld && bypassed && !undoWasBypassed) {
                    bypassed = false;
                    sendParam('bypass', '0');
                    refreshButtonLEDs();
                }
                undoHeld = false;
            }
            return;
        }

        /* Copy - unused */
        if (d1 === MoveCopy && d2 > 0) {
            deactivateAllSlots();
            showOverlay('Dub FX', 'All FX Off', '');
            return;
        }

        /* Loop button toggles global filter mode */
        if (d1 === MoveLoop && d2 > 0) {
            filterMode = filterMode ? 0 : 1;
            sendParam('filter_mode', String(filterMode));
            refreshButtonLEDs();
            showOverlay('Filter', filterMode === 0 ? 'LPF Mode' : 'HPF Mode', '');
            return;
        }

        /* Capture + Shift = reload sirens from sirens_dir */
        if (d1 === MoveCapture && d2 > 0 && shiftHeld) {
            sendParam('reload_sirens', '1');
            showOverlay('Sirens', 'Reloading...', '');
            return;
        }

        /* Delete - panic reset */
        if (d1 === MoveDelete && d2 > 0) {
            deactivateAllSlots();
            bypassed = false;
            sendParam('bypass', '0');
            refreshButtonLEDs();
            showOverlay('Dub FX', 'Panic Reset', '');
            return;
        }

        /* Jog wheel turn */
        if (d1 === MoveMainKnob) {
            const delta = decodeDelta(d2);
            if (springAssignMode) {
                springAssignIdx = Math.max(0, Math.min(springAssignFiles.length - 1, springAssignIdx + delta));
                return;
            }
            if (sirenAssignMode) {
                sirenAssignIdx = Math.max(0, Math.min(sirenAssignFiles.length - 1, sirenAssignIdx + delta));
                return;
            }
            if (shiftHeld) {
                /* Shift+Turn = BPM fine */
                bpm = Math.max(20, Math.min(300, bpm + delta * 0.5));
                sendParam('bpm', bpm.toFixed(1));
                showOverlay('Tempo', `${bpm.toFixed(1)} BPM`, (bpm / 300).toFixed(2));
            } else {
                /* Turn = scroll through active/latched FX */
                handleJogScroll(delta);
            }
            return;
        }

        /* Jog click */
        if (d1 === MoveMainButton && d2 > 0) {
            if (springAssignMode) {
                if (springAssignFiles.length > 0) {
                    const filename = springAssignFiles[springAssignIdx];
                    sendParam('ir_assign', filename);
                    showOverlay('Spring IR', filename.replace(/\.(aif|wav)$/i, ''), '');
                }
                exitSpringAssignMode();
                return;
            }
            if (sirenAssignMode) {
                if (sirenAssignFiles.length > 0) {
                    const n = sirenAssignPadSlot - 24;
                    const filename = sirenAssignFiles[sirenAssignIdx];
                    sendParam(`siren_assign_${n}`, filename);
                    showOverlay(`PAD ${n + 1}`, filename.replace(/\.wav$/i, ''), '');
                }
                exitSirenAssignMode();
                return;
            }
            if (shiftHeld) {
                /* Shift+Click = unused */
            } else {
                /* Click = tap tempo */
                handleTapTempo();
            }
            return;
        }

        /* Knobs E1-E8 */
        if (d1 >= MoveKnob1 && d1 <= MoveKnob8) {
            const knobIdx = d1 - MoveKnob1;
            const delta = decodeDelta(d2);
            handleKnob(knobIdx, delta);
            return;
        }

        /* Master knob - DO NOT intercept CC 79, let it pass through for volume */

        /* Track buttons */
        for (let i = 0; i < 4; i++) {
            if (d1 === TRACK_CCS[i]) {
                handleTrackButton(i, d2 > 0);
                return;
            }
        }
    }
};

globalThis.onMidiMessageExternal = function(data) {
    const status = data[0] & 0xF0;
    const d1 = data[1];
    const d2 = data[2];
    if (status !== 0xB0) return;

    for (let row = 0; row < MIDIMIX_KNOB_ROWS.length; row++) {
        const strip = MIDIMIX_KNOB_ROWS[row].indexOf(d1);
        if (strip >= 0) {
            const slot = MIDIMIX_SPACE_SLOTS[strip];
            setSpaceSlotParam(slot, row, d2 / 127.0);
            return;
        }
    }

    for (let i = 0; i < MIDIMIX_FADERS.length; i++) {
        if (d1 !== MIDIMIX_FADERS[i]) continue;
        const value = d2 / 127.0;
        if (i <= 3) {
            setIsoBand(i, value);
            showOverlay('Isolator', ISO_LABELS[i], value.toFixed(2));
        } else if (i === 4) {
            dryWetValue = value;
            sendParam('dry_wet', dryWetValue.toFixed(3));
            showOverlay('Mix', 'Master', dryWetValue.toFixed(2));
        } else if (i === 5) {
            setGroupedSlotParam(ECHO_SLOTS, 2, value, 'Mix', 'Echo Send');
        } else if (i === 6) {
            setGroupedSlotParam(REVERB_SLOTS, 2, value, 'Mix', 'Verb Send');
        } else if (i === 7) {
            filterCutoffValue = value;
            sendParam('dj_filter', value.toFixed(3));
            showOverlay('Filter', filterMode === 0 ? 'LPF Cutoff' : 'HPF Cutoff', value.toFixed(2));
        }
        return;
    }

    if (d1 === MIDIMIX_MASTER) {
        dryWetValue = d2 / 127.0;
        sendParam('dry_wet', dryWetValue.toFixed(3));
        showOverlay('Mix', 'Master', dryWetValue.toFixed(2));
        return;
    }

    for (let i = 0; i < MIDIMIX_REC.length; i++) {
        if (d1 !== MIDIMIX_REC[i]) continue;
        const slot = MIDIMIX_SPACE_SLOTS[i];
        if (d2 > 0) {
            fxActive[slot] = true;
            lastTouchedSlot = slot;
            sendParam(`punch_${slot}_on`, '0.700');
        } else if (!fxLatched[slot]) {
            deactivateSlot(slot);
        }
        refreshPadLED(slot);
        return;
    }

    for (let i = 0; i < MIDIMIX_MUTE.length; i++) {
        if (d1 === MIDIMIX_MUTE[i] && d2 > 0) {
            const slot = MIDIMIX_SPACE_SLOTS[i];
            setLatchedSlot(slot, !fxLatched[slot]);
            return;
        }
    }

    for (let i = 0; i < MIDIMIX_SOLO.length; i++) {
        if (d1 !== MIDIMIX_SOLO[i] || d2 <= 0) continue;
        if (i <= 3) {
            toggleIsoKill(i);
        } else if (i === 4) {
            bypassed = !bypassed;
            sendParam('bypass', bypassed ? '1' : '0');
            refreshButtonLEDs();
            showOverlay('Mix', bypassed ? 'Bypassed' : 'Active', '');
        } else {
            const filterSlots = [8, 9, 10, 15];
            const slot = filterSlots[i - 5];
            setLatchedSlot(slot, !fxLatched[slot]);
        }
        return;
    }
};
